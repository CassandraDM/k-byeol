import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SlideUpSheet } from '@/components/ui/slide-up-sheet';
import { CustomFonts, Palette } from '@/constants/theme';
import {
  blockUser,
  leaveEvent,
  setHideBlockedEvents,
  submitReport,
  type ConflictingEvent,
  type ReportTargetType,
} from '@/utils/moderation';

interface ModerationMenuProps {
  targetType: ReportTargetType;
  targetId: number;
  /** Used in the confirmation copy, e.g. "Block Jennie?". */
  targetName?: string | null;
  /** Events can be reported but not blocked. */
  canBlock?: boolean;
  /** Called after a successful block — the caller decides where to go next. */
  onBlocked?: () => void;
}

/** Which panel the single sheet is currently showing. */
type Mode = 'menu' | 'report';

/**
 * The "⋯" entry point for reporting and blocking.
 *
 * One sheet swaps between the menu and the report form rather than stacking
 * two modals, which is unreliable on iOS.
 */
export function ModerationMenu({
  targetType,
  targetId,
  targetName,
  canBlock = false,
  onBlocked,
}: ModerationMenuProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('menu');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setOpen(false);
    // Reset once the sheet is out of sight, not mid-animation.
    setTimeout(() => {
      setMode('menu');
      setReason('');
    }, 250);
  };

  const handleSubmitReport = async () => {
    if (reason.trim().length < 3 || submitting) return;
    setSubmitting(true);
    const ok = await submitReport(targetType, targetId, reason);
    setSubmitting(false);

    if (ok) {
      close();
      Alert.alert(
        'Report sent',
        'Thanks — our team will take a look. You can also block this person if you would rather not see them again.',
      );
    } else {
      Alert.alert('Something went wrong', 'Your report was not sent. Try again.');
    }
  };

  /**
   * The block is done, but they had signed up for this person's events and
   * chose to hide blocked users' events — so those would quietly vanish.
   * Rather than let that happen silently, make it their call.
   */
  const resolveEventConflict = (
    who: string,
    events: ConflictingEvent[],
    done: () => void,
  ) => {
    const isOne = events.length === 1;
    const which = isOne
      ? `"${events[0].title}"`
      : `${events.length} events you joined`;

    Alert.alert(
      isOne ? 'You joined this event' : 'You joined their events',
      `${which} ${isOne ? 'is' : 'are'} organised by ${who}. You chose to hide events from people you block, so ${isOne ? 'it' : 'they'} will disappear from your map. What would you like to do?`,
      [
        {
          text: isOne ? 'Leave the event' : 'Leave them',
          style: 'destructive',
          onPress: async () => {
            await Promise.all(events.map((e) => leaveEvent(e.id)));
            done();
          },
        },
        {
          text: 'Stay, show their events',
          onPress: async () => {
            await setHideBlockedEvents(false);
            done();
          },
        },
      ],
      { cancelable: false },
    );
  };

  const handleBlock = () => {
    const who = targetName ?? 'this user';
    Alert.alert(
      `Block ${who}?`,
      `You will no longer see ${who}'s messages, events or profile — and they will no longer see yours. You can undo this later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const result = await blockUser(targetId);
            if (!result) {
              Alert.alert('Something went wrong', 'Could not block. Try again.');
              return;
            }

            close();
            if (result.conflictingEvents.length > 0) {
              // Leave the screen only once they've resolved the conflict.
              resolveEventConflict(who, result.conflictingEvents, () =>
                onBlocked?.(),
              );
            } else {
              onBlocked?.();
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityLabel="More options">
        <Ionicons
          name="ellipsis-horizontal"
          size={22}
          color={Palette.purple}
        />
      </Pressable>

      <SlideUpSheet visible={open} onClose={close}>
        <View style={styles.sheet}>
          {mode === 'menu' ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => setMode('report')}>
                <Ionicons name="flag-outline" size={20} color={Palette.purple} />
                <Text style={styles.rowText}>
                  Report {targetType === 'EVENT' ? 'this event' : 'this user'}
                </Text>
              </Pressable>

              {canBlock && (
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.pressed,
                  ]}
                  onPress={handleBlock}>
                  <Ionicons name="ban-outline" size={20} color="#E74C3C" />
                  <Text style={[styles.rowText, styles.danger]}>
                    Block {targetName ?? 'this user'}
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={close}>
                <Ionicons
                  name="close"
                  size={20}
                  color="rgba(207, 126, 242, 0.45)"
                />
                <Text style={[styles.rowText, styles.muted]}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.reportBody}>
              {/* Header actions, matching the filter sheet's Reset / Apply. */}
              <View style={styles.reportHeader}>
                <Text style={styles.title}>Report</Text>
                <View style={styles.headerActions}>
                  <Pressable onPress={close} hitSlop={10}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSubmitReport}
                    disabled={reason.trim().length < 3 || submitting}
                    hitSlop={10}>
                    {submitting ? (
                      <ActivityIndicator color={Palette.purple} size="small" />
                    ) : (
                      <Text
                        style={[
                          styles.sendText,
                          reason.trim().length < 3 && styles.sendDisabled,
                        ]}>
                        Send
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>

              <Text style={styles.hint}>
                Your report is private. The person you report is not told.
              </Text>

              <TextInput
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder="What is happening?"
                placeholderTextColor="rgba(207, 126, 242, 0.5)"
                multiline
                textAlignVertical="top"
                maxLength={1000}
                autoFocus
              />
            </View>
          )}
        </View>
      </SlideUpSheet>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
  },
  pressed: {
    opacity: 0.7,
  },
  rowText: {
    fontFamily: CustomFonts.outfitMedium,
    fontSize: 15,
    color: Palette.purple,
  },
  danger: {
    color: '#E74C3C',
  },
  muted: {
    color: 'rgba(207, 126, 242, 0.45)',
  },
  reportBody: {
    gap: 8,
    paddingBottom: 8,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  title: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 26,
    color: Palette.purple,
    lineHeight: 34,
    paddingTop: 4,
  },
  cancelText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 18,
    color: Palette.purple,
  },
  sendText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 18,
    color: Palette.purple,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  hint: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: Palette.purple,
    lineHeight: 18,
  },
  input: {
    minHeight: 110,
    borderRadius: 12,
    backgroundColor: Palette.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.input,
    marginTop: 4,
  },
});
