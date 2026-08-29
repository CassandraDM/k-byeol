import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SlideUpSheet } from '@/components/ui/slide-up-sheet';
import { CustomFonts, Palette } from '@/constants/theme';
import {
  ASSIGNABLE_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  canActOn,
  canSetRoleOf,
  formatMuteDeadline,
  muteParticipant,
  removeFromConversation,
  setParticipantRole,
  sortedMembers,
  unmuteParticipant,
  type AssignableRole,
  type Conversation,
  type ConversationParticipant,
} from '@/utils/conversations';

interface ChatMembersSheetProps {
  conversation: Conversation;
  /** Marks the viewer's own row. */
  currentUserId: number | null;
  /** Called after any successful change so the caller can refresh. */
  onChanged: () => void;
}

/** How long a timed mute can last, in the order the menu offers them. */
const MUTE_DURATIONS: { label: string; minutes?: number }[] = [
  { label: 'For 15 minutes', minutes: 15 },
  { label: 'For 1 hour', minutes: 60 },
  { label: 'For 1 day', minutes: 60 * 24 },
  { label: 'Until I lift it', minutes: undefined },
];

/**
 * The control panel for an event chat: set what each person may do, silence
 * them for a while, or remove them from the thread.
 *
 * Which controls appear depends on the viewer's own role — the API enforces
 * the same rules, this only keeps buttons out of the way of people who cannot
 * use them.
 */
export function ChatMembersSheet({
  conversation,
  currentUserId,
  onChanged,
}: ChatMembersSheetProps) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  /** Whose role picker is showing, if any. */
  const [picking, setPicking] = useState<ConversationParticipant | null>(null);

  const members = sortedMembers(conversation.participants);

  const run = async (
    userId: number,
    action: () => Promise<boolean>,
    failure: string,
  ) => {
    setPendingId(userId);
    const ok = await action();
    setPendingId(null);
    if (ok) {
      onChanged();
    } else {
      Alert.alert('Something went wrong', failure);
    }
  };

  const chooseRole = (member: ConversationParticipant, role: AssignableRole) => {
    setPicking(null);
    if (role === member.role) return;
    run(
      member.id,
      () => setParticipantRole(conversation.id, member.id, role),
      'Could not change their role. Try again.',
    );
  };

  const offerMute = (member: ConversationParticipant) => {
    if (member.isMuted) {
      run(
        member.id,
        () => unmuteParticipant(conversation.id, member.id),
        'Could not lift the mute. Try again.',
      );
      return;
    }

    Alert.alert(
      `Mute ${member.username}?`,
      'Their role is suspended while the mute lasts — they can read the chat but nothing else. It comes back on its own, or when you lift it.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...MUTE_DURATIONS.map((option) => ({
          text: option.label,
          onPress: () =>
            run(
              member.id,
              () => muteParticipant(conversation.id, member.id, option.minutes),
              'Could not mute them. Try again.',
            ),
        })),
      ],
    );
  };

  const confirmRemove = (member: ConversationParticipant) => {
    Alert.alert(
      `Remove ${member.username}?`,
      `${member.username} will lose access to this chat. They stay signed up for the event.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            run(
              member.id,
              () => removeFromConversation(conversation.id, member.id),
              'Could not remove them. Try again.',
            ),
        },
      ],
    );
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Manage the people in this chat">
        <Ionicons name="people-outline" size={22} color={Palette.purple} />
      </Pressable>

      <SlideUpSheet
        visible={open}
        onClose={() => {
          setOpen(false);
          setPicking(null);
        }}>
        <View style={styles.sheet}>
          {picking ? (
            <RolePicker
              member={picking}
              onPick={(role) => chooseRole(picking, role)}
              onCancel={() => setPicking(null)}
            />
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>People</Text>
                <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                  <Text style={styles.done}>Done</Text>
                </Pressable>
              </View>

              <Text style={styles.hint}>
                Everyone here can read the chat. Tap a role to change what
                someone may do — muting keeps the role but suspends it until
                the mute is lifted.
              </Text>

              <ScrollView
                style={styles.list}
                keyboardShouldPersistTaps="handled">
                {members.map((member) => {
                  const isMe = member.id === currentUserId;
                  const busy = pendingId === member.id;
                  const roleEditable = canSetRoleOf(conversation, member);
                  const actionable = canActOn(conversation, member);

                  return (
                    <View key={member.id} style={styles.row}>
                      {member.avatar ? (
                        <Image
                          source={{ uri: member.avatar }}
                          style={styles.avatar}
                        />
                      ) : (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                          <Ionicons name="person" size={16} color="#fff" />
                        </View>
                      )}

                      <View style={styles.rowBody}>
                        <Text style={styles.username} numberOfLines={1}>
                          {member.username}
                          {isMe && <Text style={styles.you}> (you)</Text>}
                        </Text>
                        {member.isMuted && (
                          <Text style={styles.muted} numberOfLines={1}>
                            Read-only while muted
                            {member.mutedUntil
                              ? ` · until ${formatMuteDeadline(member.mutedUntil)}`
                              : ''}
                          </Text>
                        )}
                      </View>

                      {busy ? (
                        <ActivityIndicator
                          size="small"
                          color={Palette.purple}
                        />
                      ) : (
                        <View style={styles.actions}>
                          {/* The role doubles as the button that changes it.
                              For anyone who cannot edit it, it is just a
                              label. */}
                          <Pressable
                            onPress={() => roleEditable && setPicking(member)}
                            disabled={!roleEditable}
                            hitSlop={6}
                            accessibilityRole={
                              roleEditable ? 'button' : undefined
                            }
                            accessibilityLabel={
                              roleEditable
                                ? `${member.username}: ${ROLE_LABELS[member.role]}. Change role`
                                : undefined
                            }
                            style={({ pressed }) => [
                              styles.roleChip,
                              roleEditable && styles.roleChipEditable,
                              // Dimmed while a mute holds it in abeyance.
                              member.isMuted && styles.roleChipSuspended,
                              pressed && roleEditable && styles.pressed,
                            ]}>
                            <Text style={styles.roleChipText}>
                              {ROLE_LABELS[member.role]}
                            </Text>
                            {roleEditable && (
                              <Ionicons
                                name="chevron-down"
                                size={12}
                                color={Palette.purple}
                              />
                            )}
                          </Pressable>

                          {actionable && (
                            <>
                              <Pressable
                                onPress={() => offerMute(member)}
                                hitSlop={6}
                                accessibilityLabel={
                                  member.isMuted
                                    ? `Unmute ${member.username}`
                                    : `Mute ${member.username}`
                                }
                                style={({ pressed }) =>
                                  pressed && styles.pressed
                                }>
                                <Ionicons
                                  name={
                                    member.isMuted
                                      ? 'volume-high-outline'
                                      : 'volume-mute-outline'
                                  }
                                  size={18}
                                  color={Palette.purple}
                                />
                              </Pressable>
                              <Pressable
                                onPress={() => confirmRemove(member)}
                                hitSlop={6}
                                accessibilityLabel={`Remove ${member.username}`}
                                style={({ pressed }) =>
                                  pressed && styles.pressed
                                }>
                                <Ionicons
                                  name="person-remove-outline"
                                  size={18}
                                  color="#E74C3C"
                                />
                              </Pressable>
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </>
          )}
        </View>
      </SlideUpSheet>
    </>
  );
}

/** The four assignable roles, with what each one actually allows. */
function RolePicker({
  member,
  onPick,
  onCancel,
}: {
  member: ConversationParticipant;
  onPick: (role: AssignableRole) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {member.username}
        </Text>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Text style={styles.done}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {ASSIGNABLE_ROLES.map((role) => {
          const current = member.role === role;
          return (
            <Pressable
              key={role}
              onPress={() => onPick(role)}
              accessibilityRole="button"
              accessibilityState={{ selected: current }}
              style={({ pressed }) => [
                styles.roleOption,
                current && styles.roleOptionCurrent,
                pressed && styles.pressed,
              ]}>
              <View style={styles.roleOptionBody}>
                <Text style={styles.roleOptionTitle}>{ROLE_LABELS[role]}</Text>
                <Text style={styles.roleOptionText}>
                  {ROLE_DESCRIPTIONS[role]}
                </Text>
              </View>
              {current && (
                <Ionicons name="checkmark" size={18} color={Palette.purple} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: 480,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flexShrink: 1,
    fontFamily: CustomFonts.moyamoya,
    fontSize: 26,
    color: Palette.purple,
    lineHeight: 34,
    paddingTop: 4,
  },
  done: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 18,
    color: Palette.purple,
  },
  hint: {
    fontFamily: CustomFonts.outfit,
    fontSize: 12,
    color: 'rgba(207, 126, 242, 0.85)',
    lineHeight: 17,
    marginTop: 2,
    marginBottom: 10,
  },
  list: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(207, 126, 242, 0.15)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    backgroundColor: Palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 1,
  },
  username: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 15,
    color: Palette.purple,
  },
  you: {
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: 'rgba(207, 126, 242, 0.7)',
  },
  muted: {
    fontFamily: CustomFonts.outfit,
    fontSize: 11,
    color: '#E07EFF',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(207, 126, 242, 0.12)',
  },
  roleChipEditable: {
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.45)',
  },
  roleChipSuspended: {
    opacity: 0.5,
  },
  roleChipText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 14,
    color: Palette.purple,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.2)',
    marginBottom: 8,
  },
  roleOptionCurrent: {
    backgroundColor: 'rgba(207, 126, 242, 0.14)',
    borderColor: Palette.purple,
  },
  roleOptionBody: {
    flex: 1,
    gap: 2,
  },
  roleOptionTitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 16,
    color: Palette.purple,
  },
  roleOptionText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(207, 126, 242, 0.85)',
  },
  pressed: {
    opacity: 0.75,
  },
});
