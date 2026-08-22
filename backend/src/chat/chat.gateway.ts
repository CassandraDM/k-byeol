import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth as { token?: string }).token ??
        (client.handshake.headers.authorization?.split(' ')[1]);

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
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
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    const userId = client.data.user?.id;
    if (!userId) return;

    const isParticipant = await this.chatService.isParticipant(
      userId,
      data.conversationId,
    );
    if (!isParticipant) {
      client.emit('error', { message: 'Not a participant of this conversation' });
      return;
    }

    client.join(`conversation:${data.conversationId}`);
    client.emit('joinedConversation', { conversationId: data.conversationId });
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    client.leave(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number; text: string },
  ) {
    const userId = client.data.user?.id;
    if (!userId) return;

    const canWrite = await this.chatService.canWrite(
      userId,
      data.conversationId,
    );
    if (!canWrite) {
      client.emit('error', { message: 'You do not have write access to this conversation' });
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
      .map((s) => s.data.user?.id as number | undefined)
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
