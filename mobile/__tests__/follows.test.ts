import {
  applyFollowLocally,
  fetchFollowers,
  fetchUserFollowing,
  followButton,
  followUser,
  unfollowUser,
  type FollowState,
} from '@/utils/follows';
import { apiFetch } from '@/utils/api';

// `apiFetch` drags in expo-router and the auth store; the contract under test
// is what these helpers do with a response, not how the request is signed.
jest.mock('@/utils/api', () => ({ apiFetch: jest.fn() }));

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

/** A response good enough for the helpers, without a whole Response object. */
const respond = (ok: boolean, body: unknown = {}, status = ok ? 200 : 500) =>
  ({ ok, status, json: async () => body }) as Response;

const state = (overrides: Partial<FollowState> = {}): FollowState => ({
  isFollowing: false,
  followsYou: false,
  isFriend: false,
  followerCount: 0,
  followingCount: 0,
  ...overrides,
});

beforeEach(() => {
  mockedFetch.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('followButton', () => {
  it('invites a stranger to follow', () => {
    expect(followButton(state())).toMatchObject({
      label: 'Follow',
      active: false,
    });
  });

  it('offers to follow back somebody who already follows you', () => {
    expect(followButton(state({ followsYou: true }))).toMatchObject({
      label: 'Follow back',
      active: false,
    });
  });

  it('reads as "Following" for a one-way follow', () => {
    expect(followButton(state({ isFollowing: true }))).toMatchObject({
      label: 'Following',
      active: true,
    });
  });

  it('reads as "Friends" once the follow goes both ways', () => {
    expect(
      followButton(
        state({ isFollowing: true, followsYou: true, isFriend: true }),
      ),
    ).toMatchObject({ label: 'Friends', active: true });
  });
});

describe('applyFollowLocally', () => {
  it('adds a follower the moment the button is tapped', () => {
    expect(applyFollowLocally(state({ followerCount: 4 }), true)).toMatchObject(
      { isFollowing: true, followerCount: 5 },
    );
  });

  it('removes one again on unfollow', () => {
    const following = state({ isFollowing: true, followerCount: 5 });
    expect(applyFollowLocally(following, false)).toMatchObject({
      isFollowing: false,
      followerCount: 4,
    });
  });

  it('turns a follow-back into friendship straight away', () => {
    const result = applyFollowLocally(state({ followsYou: true }), true);
    expect(result.isFriend).toBe(true);
  });

  it('drops friendship when you unfollow someone who follows you', () => {
    const friends = state({
      isFollowing: true,
      followsYou: true,
      isFriend: true,
      followerCount: 3,
    });
    expect(applyFollowLocally(friends, false)).toMatchObject({
      isFriend: false,
      followerCount: 2,
    });
  });

  it('ignores a repeat of the state it is already in', () => {
    // A double tap must not move the counter twice.
    const following = state({ isFollowing: true, followerCount: 5 });
    expect(applyFollowLocally(following, true)).toBe(following);
  });

  it('never lets the count go negative', () => {
    // The screen can be stale — the server is the one that decides the truth.
    const stale = state({ isFollowing: true, followerCount: 0 });
    expect(applyFollowLocally(stale, false).followerCount).toBe(0);
  });
});

describe('followUser / unfollowUser', () => {
  it('POSTs to the follow endpoint and returns the new state', async () => {
    const body = state({ isFollowing: true, followerCount: 1 });
    mockedFetch.mockResolvedValueOnce(respond(true, body));

    await expect(followUser(7)).resolves.toEqual(body);
    expect(mockedFetch).toHaveBeenCalledWith('/users/7/follow', {
      method: 'POST',
    });
  });

  it('DELETEs the same endpoint to unfollow', async () => {
    mockedFetch.mockResolvedValueOnce(respond(true, state()));

    await unfollowUser(7);
    expect(mockedFetch).toHaveBeenCalledWith('/users/7/follow', {
      method: 'DELETE',
    });
  });

  it('returns null on a rejected request so the caller can roll back', async () => {
    mockedFetch.mockResolvedValueOnce(respond(false, {}, 404));
    await expect(followUser(7)).resolves.toBeNull();
  });

  it('returns null rather than throwing when the network is down', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(followUser(7)).resolves.toBeNull();
  });
});

describe('fetchUserFollowing / fetchFollowers', () => {
  it('reads followers for the profile being viewed', async () => {
    const body = { count: 2, followers: [] };
    mockedFetch.mockResolvedValueOnce(respond(true, body));

    await expect(fetchFollowers(7)).resolves.toEqual(body);
    expect(mockedFetch).toHaveBeenCalledWith('/users/7/followers');
  });

  it('reads a following list from the id route, for anyone', async () => {
    // The same call serves your own profile — no second code path for "me".
    const body = { count: 3, following: [] };
    mockedFetch.mockResolvedValueOnce(respond(true, body));

    await expect(fetchUserFollowing(7)).resolves.toEqual(body);
    expect(mockedFetch).toHaveBeenCalledWith('/users/7/following');
  });

  it('reports a blocked profile as a failed read, not an empty list', async () => {
    // The API answers 404 rather than admitting the block exists.
    mockedFetch.mockResolvedValueOnce(respond(false, {}, 404));
    await expect(fetchUserFollowing(7)).resolves.toBeNull();
  });

  it('distinguishes a failed read from an empty list', async () => {
    // An empty array would render as "nobody follows you", which may be a lie.
    mockedFetch.mockResolvedValueOnce(respond(false, {}, 500));
    await expect(fetchFollowers(7)).resolves.toBeNull();
  });
});
