import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { CustomFonts, Palette } from '@/constants/theme';

interface UndoToastProps {
  /** What happened, e.g. "Message deleted". Null hides the toast. */
  message: string | null;
  onUndo: () => void;
  /** Called when the window closes, by timeout or by tapping Undo. */
  onDismiss: () => void;
  /** How long the offer stands. */
  durationMs?: number;
}

const DEFAULT_DURATION = 3500;

/**
 * A brief "done — undo?" bar above the composer.
 *
 * Sits in the thread rather than in an OS alert: the point of an undo is that
 * it does not interrupt, so it must be ignorable. Tapping anywhere else simply
 * lets it expire.
 */
export function UndoToast({
  message,
  onUndo,
  onDismiss,
  durationMs = DEFAULT_DURATION,
}: UndoToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  // Kept in a ref so the timer effect does not restart every render when the
  // parent re-creates its callbacks.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (!message) return;

    Animated.timing(opacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => dismiss.current(), durationMs);
    return () => {
      clearTimeout(timer);
      opacity.setValue(0);
    };
  }, [message, durationMs, opacity]);

  if (!message) return null;

  return (
    <Animated.View style={[styles.toast, { opacity }]}>
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
      <Pressable
        onPress={onUndo}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Undo"
        style={({ pressed }) => pressed && styles.pressed}>
        <Text style={styles.undo}>Undo</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(58, 22, 82, 0.94)',
    shadowColor: '#4A1B6D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  text: {
    flex: 1,
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: '#F3E6FF',
  },
  undo: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 16,
    color: Palette.white,
  },
  pressed: {
    opacity: 0.7,
  },
});
