import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { WsException } from '@nestjs/websockets';
import { UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket, DefaultEventsMap } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { JoinConversationDto, SendMessageDto } from './dto/chat-events.dto';
import type { AuthUser, JwtPayload } from '../auth/jwt-payload';

/**
 * The global ValidationPipe only covers HTTP routes, so socket frames would
 * otherwise reach the service completely unvalidated. Errors are wrapped in a
 * WsException: a BadRequestException in a gateway has no response to write to.
 */
const wsValidation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errors) =>
    new WsException(
      errors.flatMap((e) => Object.values(e.constraints ?? {})).join(', ') ||
        'Invalid payload',
    ),
});

/**
 * socket.io leaves its `data` bag as `any` by default. Binding the generic is
 * what lets every handler below read `client.data.user.id` as a real number
 * instead of an unchecked `any` flowing straight into database queries.
 */
interface SocketData {
  user?: AuthUser;
}
type AuthedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

@WebSocketGateway({ cors: { origin: '*' } })
@UsePipes(wsValidation)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    try {
      const token =
        (client.handshake.auth as { token?: string }).token ??
        client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (typeof payload.sub !== 'number') {
        client.disconnect();
        return;
      }
      client.data.user = { id: payload.sub, email: payload.email };
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect() {
    // cleanup if needed
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: JoinConversationDto,
  ) {
    const userId = client.data.user?.id;
    if (!userId) return;

    const isParticipant = await this.chatService.isParticipant(
      userId,
      data.conversationId,
    );
    if (!isParticipant) {
      client.emit('error', {
        message: 'Not a participant of this conversation',
      });
      return;
    }

    // join()/leave() are async in a clustered adapter; nothing here depends
    // on completion, so the promise is explicitly discarded.
    void client.join(`conversation:${data.conversationId}`);
    client.emit('joinedConversation', { conversationId: data.conversationId });
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: JoinConversationDto,
  ) {
    void client.leave(`conversation:${data.conversationId}`);
  }

  /**
   * Tells everyone in a thread that a message changed.
   *
   * Called by the REST layer, which owns the write: the routes are the API,
   * and this is only how the news reaches the people already looking at it.
   */
  broadcastMessageEdited(
    conversationId: number,
    message: { id: number; text: string; editedAt: Date | null },
  ): void {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('messageEdited', { ...message, conversationId });
  }

  /**
   * Tells everyone in a thread that a deleted message is back.
   *
   * Carries the whole message: everyone dropped it when it went, so an id
   * alone would leave them nothing to put back.
   */
  broadcastMessageRestored(
    conversationId: number,
    message: { id: number; text: string; createdAt: Date },
  ): void {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('messageRestored', { ...message, conversationId });
  }

  /** Tells everyone in a thread that a message is gone. */
  broadcastMessageDeleted(
    conversationId: number,
    message: { id: number; deletedAt: Date | null },
  ): void {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('messageDeleted', { ...message, conversationId });
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: SendMessageDto,
  ) {
    const userId = client.data.user?.id;
    if (!userId) return;

    const canWrite = await this.chatService.canWrite(
      userId,
      data.conversationId,
    );
    if (!canWrite) {
      client.emit('error', {
        message: 'You do not have write access to this conversation',
      });
      return;
    }

    const message = await this.chatService.saveMessage(
      userId,
      data.conversationId,
      data.text,
    );

    const room = `conversation:${data.conversationId}`;
    this.server.to(room).emit('newMessage', message);

    // Everyone with the thread open right now got it live — only push to the
    // rest. Don't make the sender wait on it.
    const sockets = await this.server.in(room).fetchSockets();
    const activeUserIds = sockets
      .map((s) => (s.data as SocketData).user?.id)
      .filter((id): id is number => typeof id === 'number');

    void this.chatService.notifyNewMessage(
      data.conversationId,
      userId,
      message.sender.username,
      message.text,
      activeUserIds,
    );
  }
}
