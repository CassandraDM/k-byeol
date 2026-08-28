import { apiFetch } from '@/utils/api';

/**
 * Where the signed-in user stands with somebody else. Every write endpoint
 * answers with this shape, so the button can repaint without a second fetch.
 */
export interface FollowState {
  isFollowing: boolean;
  followsYou: boolean;
  /** Mutual follow — what this app calls being friends. */
  isFriend: boolean;
  followerCount: number;
  followingCount: number;
}

/** One person in a following / followers list. */
export interface Connection {
  id: number;
  username: string;
  avatar: string | null;
  bio: string | null;
  followedAt: string;
  isFriend: boolean;
}

export interface FollowersResponse {
  count: number;
  followers: Connection[];
}

export interface FollowingResponse {
  count: number;
  following: Connection[];
}

/** What the follow button should say and do for a given relationship. */
export interface FollowButton {
  label: string;
  /** True once the user is following — the button then reads as "undo". */
  active: boolean;
  /** Spoken to screen readers, and used in the confirmation dialog. */
  hint: string;
}

/**
 * The button's whole appearance, derived from the relationship alone.
 *
 * Pulled out of the component so the four cases — stranger, followed back,
 * one-way follow, friends — can be checked without rendering anything.
 */
export function followButton(state: FollowState): FollowButton {
  if (state.isFriend) {
    return {
      label: 'Friends',
      active: true,
      hint: 'You follow each other',
    };
  }
  if (state.isFollowing) {
    return {
      label: 'Following',
      active: true,
      hint: 'Tap to unfollow',
    };
  }
  if (state.followsYou) {
    return {
      label: 'Follow back',
      active: false,
      hint: 'They already follow you',
    };
  }
  return { label: 'Follow', active: false, hint: 'Get notified of new events' };
}

/**
 * The state the screen should show the instant the button is tapped, before
 * the server has answered.
 *
 * Kept separate from the request so a slow network never leaves the button
 * looking stuck — and so the rollback on failure is just the previous value.
 */
export function applyFollowLocally(
  state: FollowState,
  following: boolean,
): FollowState {
  // Following the same person twice must not move the counter twice.
  if (state.isFollowing === following) return state;

  return {
    ...state,
    isFollowing: following,
    isFriend: following && state.followsYou,
    followerCount: Math.max(0, state.followerCount + (following ? 1 : -1)),
  };
}

/** Follows a user. Returns the server's view of the relationship, or null. */
export async function followUser(userId: number): Promise<FollowState | null> {
  return write(`/users/${userId}/follow`, 'POST');
}

/** Unfollows a user. Returns the server's view of the relationship, or null. */
export async function unfollowUser(
  userId: number,
): Promise<FollowState | null> {
  return write(`/users/${userId}/follow`, 'DELETE');
}

async function write(
  path: string,
  method: 'POST' | 'DELETE',
): Promise<FollowState | null> {
  try {
    const res = await apiFetch(path, { method });
    if (!res.ok) {
      console.error(`[follows] ${method} ${path} failed →`, res.status);
      return null;
    }
    return (await res.json()) as FollowState;
  } catch (e) {
    console.error(`[follows] ${method} ${path} error →`, e);
    return null;
  }
}

/**
 * Who a given profile follows, count included. Null means the read failed.
 *
 * Works for the signed-in user too, so there is no second code path for your
 * own list. (The API also exposes `/users/me/following`, which answers with a
 * bare array; nothing in the app reads it.)
 */
export async function fetchUserFollowing(
  userId: number,
): Promise<FollowingResponse | null> {
  try {
    const res = await apiFetch(`/users/${userId}/following`);
    if (!res.ok) {
      console.error('[follows] Profile following list failed →', res.status);
      return null;
    }
    return (await res.json()) as FollowingResponse;
  } catch (e) {
    console.error('[follows] Profile following list error →', e);
    return null;
  }
}

/** A user's followers, count included. Null means the read failed. */
export async function fetchFollowers(
  userId: number,
): Promise<FollowersResponse | null> {
  try {
    const res = await apiFetch(`/users/${userId}/followers`);
    if (!res.ok) {
      console.error('[follows] Followers list failed →', res.status);
      return null;
    }
    return (await res.json()) as FollowersResponse;
  } catch (e) {
    console.error('[follows] Followers list error →', e);
    return null;
  }
}
