import { apiFetch } from '@/utils/api';

export type ReportTargetType = 'USER' | 'EVENT';

/**
 * Files a moderation report. Returns false on failure so callers can surface
 * a message without having to unpack the response themselves.
 */
export async function submitReport(
  targetType: ReportTargetType,
  targetId: number,
  reason: string,
): Promise<boolean> {
  try {
    const res = await apiFetch('/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType, targetId, reason: reason.trim() }),
    });
    if (!res.ok) {
      console.error('[moderation] Report failed →', res.status);
    }
    return res.ok;
  } catch (e) {
    console.error('[moderation] Report error →', e);
    return false;
  }
}

/** An event the blocker joined that this block would hide from them. */
export interface ConflictingEvent {
  id: number;
  title: string;
}

export interface BlockResult {
  /** Events they signed up for that the block is about to hide. */
  conflictingEvents: ConflictingEvent[];
}

/** Blocks a user. Returns null on failure. */
export async function blockUser(userId: number): Promise<BlockResult | null> {
  try {
    const res = await apiFetch(`/users/${userId}/block`, { method: 'POST' });
    if (!res.ok) {
      console.error('[moderation] Block failed →', res.status);
      return null;
    }
    const data = await res.json();
    return { conflictingEvents: data.conflictingEvents ?? [] };
  } catch (e) {
    console.error('[moderation] Block error →', e);
    return null;
  }
}

/** Cancels the current user's participation in an event. */
export async function leaveEvent(eventId: number): Promise<boolean> {
  try {
    const res = await apiFetch(`/events/${eventId}/participate`, {
      method: 'DELETE',
    });
    if (!res.ok) console.error('[moderation] Leave failed →', res.status);
    return res.ok;
  } catch (e) {
    console.error('[moderation] Leave error →', e);
    return false;
  }
}

/** Flips the "hide events from blocked users" preference. */
export async function setHideBlockedEvents(value: boolean): Promise<boolean> {
  try {
    const res = await apiFetch('/users/me/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hideBlockedEvents: value }),
    });
    if (!res.ok) console.error('[moderation] Preference failed →', res.status);
    return res.ok;
  } catch (e) {
    console.error('[moderation] Preference error →', e);
    return false;
  }
}

export async function unblockUser(userId: number): Promise<boolean> {
  try {
    const res = await apiFetch(`/users/${userId}/block`, { method: 'DELETE' });
    if (!res.ok) console.error('[moderation] Unblock failed →', res.status);
    return res.ok;
  } catch (e) {
    console.error('[moderation] Unblock error →', e);
    return false;
  }
}
