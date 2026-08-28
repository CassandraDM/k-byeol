import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';
import {
  applyFollowLocally,
  followButton,
  followUser,
  unfollowUser,
  type FollowState,
} from '@/utils/follows';

interface FollowButtonProps {
  userId: number;
  /** Name used in the unfollow confirmation, when we know it. */
  username?: string | null;
  state: FollowState;
  /** Bubbles every change up so the profile's counters stay in step. */
  onChange: (state: FollowState) => void;
}

/**
 * Follow / unfollow control for a profile.
 *
 * Updates optimistically and rolls back on failure: the tap has to feel
 * instant, and the request is the part that might be slow.
 */
export function FollowButton({
  userId,
  username,
  state,
  onChange,
}: FollowButtonProps) {
  const [pending, setPending] = useState(false);
  const button = followButton(state);

  const run = async (following: boolean) => {
    const previous = state;
    setPending(true);
    onChange(applyFollowLocally(state, following));

    const result = following
      ? await followUser(userId)
      : await unfollowUser(userId);
    setPending(false);

    if (!result) {
      onChange(previous);
      Alert.alert(
        'Something went wrong',
        `Could not ${following ? 'follow' : 'unfollow'}. Try again.`,
      );
      return;
    }
    // The server's count is authoritative — other people have been following
    // them while this screen was open.
    onChange(result);
  };

  const handlePress = () => {
    if (pending) return;
    if (!state.isFollowing) {
      run(true);
      return;
    }

    const who = username ?? 'this user';
    Alert.alert(
      `Unfollow ${who}?`,
      `You will stop getting notified when ${who} adds an event.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unfollow', style: 'destructive', onPress: () => run(false) },
      ],
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={pending}
      accessibilityRole="button"
      accessibilityLabel={`${button.label} — ${button.hint}`}
      style={({ pressed }) => [
        styles.button,
        button.active ? styles.active : styles.idle,
        pressed && styles.pressed,
      ]}>
      {pending ? (
        <ActivityIndicator
          size="small"
          color={button.active ? Palette.purple : '#fff'}
        />
      ) : (
        <>
          <Ionicons
            name={
              state.isFriend
                ? 'people'
                : state.isFollowing
                  ? 'checkmark'
                  : 'person-add-outline'
            }
            size={15}
            color={button.active ? Palette.purple : '#fff'}
          />
          <Text style={[styles.label, button.active && styles.labelActive]}>
            {button.label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    minWidth: 118,
    minHeight: 36,
  },
  idle: {
    backgroundColor: Palette.purple,
    borderColor: Palette.purple,
  },
  active: {
    backgroundColor: 'rgba(207, 126, 242, 0.12)',
    borderColor: 'rgba(207, 126, 242, 0.55)',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 15,
    color: '#fff',
  },
  labelActive: {
    color: Palette.purple,
  },
});
