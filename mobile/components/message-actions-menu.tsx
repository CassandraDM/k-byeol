import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';

export interface MessageAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Draws the row in red — for the one that cannot be undone. */
  destructive?: boolean;
  onPress: () => void;
}

/** Where the pressed message sits on screen, measured before the menu opens. */
export interface MessageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MessageActionsMenuProps {
  anchor: MessageRect | null;
  /**
   * The pressed message, redrawn above the blur so it stays sharp.
   *
   * Without it the message you picked is blurred along with everything else,
   * and the menu ends up describing a bubble you can no longer read.
   */
  highlight?: ReactNode;
  /** Which edge the card lines up with — the side the bubble sits on. */
  align?: 'left' | 'right';
  /** Sent-at line above the actions, e.g. "Yesterday at 22:35". */
  timestamp?: string;
  actions: MessageAction[];
  onClose: () => void;
}

const CARD_WIDTH = 236;
const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 34;
/** Keeps the card off the very edge of the screen. */
const MARGIN = 12;
/** Space between the message and its menu. */
const GAP = 10;

/**
 * The long-press menu for a message.
 *
 * A floating card anchored to the message rather than an OS action sheet: the
 * sheet is the same slab of grey in every app, and it pushes the thread out of
 * sight at the moment you are deciding which message you meant. Here the
 * conversation blurs, the message you pressed stays sharp above it, and the
 * card opens against the edge that message sits on.
 */
export function MessageActionsMenu({
  anchor,
  highlight,
  align = 'left',
  timestamp,
  actions,
  onClose,
}: MessageActionsMenuProps) {
  const { width, height } = useWindowDimensions();

  if (!anchor || actions.length === 0) return null;

  const cardHeight =
    actions.length * ROW_HEIGHT + (timestamp ? HEADER_HEIGHT : 0) + 12;

  // Line the card up with the side the bubble is on, then pull it back inside
  // the screen rather than letting it hang off an edge.
  const preferredLeft =
    align === 'right' ? anchor.x + anchor.width - CARD_WIDTH : anchor.x;
  const left = Math.min(
    Math.max(preferredLeft, MARGIN),
    width - CARD_WIDTH - MARGIN,
  );

  // Below the message by default; above it when there is no room, so the card
  // never opens under the keyboard or off the bottom of the thread.
  const below = anchor.y + anchor.height + GAP;
  const top =
    below + cardHeight > height - MARGIN
      ? Math.max(anchor.y - cardHeight - GAP, MARGIN)
      : below;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      {/* Anywhere outside the card dismisses it. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
      </Pressable>

      {highlight && (
        // Sits exactly where the real bubble is, so it reads as the same
        // message lifted out of the blur rather than a copy of it.
        <View
          pointerEvents="none"
          style={[
            styles.highlight,
            { left: anchor.x, top: anchor.y, width: anchor.width },
          ]}>
          {highlight}
        </View>
      )}

      <View
        style={[styles.card, { left, top, width: CARD_WIDTH }]}
        accessibilityViewIsModal>
        {timestamp && <Text style={styles.timestamp}>{timestamp}</Text>}

        {actions.map((action, index) => (
          <Pressable
            key={action.key}
            onPress={() => {
              // Close first: anything the action raises would otherwise open
              // behind this card.
              onClose();
              action.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [
              styles.row,
              index > 0 && styles.rowDivider,
              pressed && styles.rowPressed,
            ]}>
            <Ionicons
              name={action.icon}
              size={20}
              color={action.destructive ? '#E74C3C' : Palette.purple}
            />
            <Text
              style={[styles.label, action.destructive && styles.labelDanger]}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    // The blur alone is too subtle on Android; this settles the contrast.
    backgroundColor: 'rgba(40, 12, 60, 0.18)',
  },
  highlight: {
    position: 'absolute',
  },
  card: {
    position: 'absolute',
    borderRadius: 20,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.28)',
    shadowColor: '#4A1B6D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
    overflow: 'hidden',
  },
  timestamp: {
    fontFamily: CustomFonts.outfitMedium,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'rgba(122, 63, 176, 0.55)',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
  },
  row: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(207, 126, 242, 0.16)',
  },
  rowPressed: {
    backgroundColor: 'rgba(207, 126, 242, 0.12)',
  },
  label: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 17,
    color: Palette.purple,
  },
  labelDanger: {
    color: '#E74C3C',
  },
});
