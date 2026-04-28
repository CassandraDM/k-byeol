import { create } from 'zustand';
import { apiFetch } from '@/utils/api';
import { uploadAvatar } from '@/constants/supabase';
import { getUserIdFromToken } from '@/utils/jwt';

interface City {
  code: string;
  nom: string;
  codesPostaux: string[];
}

interface OnboardingState {
  step: number;
  completedSteps: Set<number>;
  avatarUri: string | null;
  city: City | null;
  selectedGroupIds: number[];
  isLoading: boolean;
  error: string | null;

  nextStep: () => void;
  prevStep: () => void;
  setAvatarUri: (uri: string | null) => void;
  setCity: (city: City | null) => void;
  toggleGroup: (id: number) => void;
  hydrate: (token: string) => Promise<void>;
  submit: (token: string, userId: number) => Promise<boolean>;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  step: 0,
  completedSteps: new Set(),
  avatarUri: null,
  city: null,
  selectedGroupIds: [],
  isLoading: false,
  error: null,

  nextStep: () => {
    const { completedSteps } = get();
    let next = get().step + 1;
    while (next <= 2 && completedSteps.has(next)) next++;
    if (next > 2) next = 2;
    set({ step: next });
  },
  prevStep: () => {
    const { completedSteps } = get();
    let prev = get().step - 1;
    while (prev >= 0 && completedSteps.has(prev)) prev--;
    if (prev < 0) prev = 0;
    set({ step: prev });
  },

  setAvatarUri: (uri) => set({ avatarUri: uri }),
  setCity: (city) => set({ city }),

  toggleGroup: (id) =>
    set((s) => ({
      selectedGroupIds: s.selectedGroupIds.includes(id)
        ? s.selectedGroupIds.filter((gid) => gid !== id)
        : [...s.selectedGroupIds, id],
    })),

  hydrate: async (token) => {
    set({ avatarUri: null, city: null, selectedGroupIds: [], error: null, completedSteps: new Set() });
    try {
      let hasAvatar = false;
      let hasCity = false;
      let hasGroups = false;

      // Fetch profile (avatar)
      const userId = getUserIdFromToken(token);
      if (!userId) return;
      const profileRes = await apiFetch(`/users/${userId}`);
      if (profileRes.ok) {
        const profile = await profileRes.json();
        if (profile.avatar) {
          set({ avatarUri: profile.avatar });
          hasAvatar = true;
        }
      }

      // Fetch preferences (city + groups)
      const prefsRes = await apiFetch('/users/me/preferences');
      if (prefsRes.ok) {
        const prefs = await prefsRes.json();
        if (prefs.city) {
          set({
            city: {
              code: prefs.city.code,
              nom: prefs.city.nom,
              codesPostaux: [prefs.city.codePostal],
            },
          });
          hasCity = true;
        }
        if (prefs.groups?.length > 0) {
          set({ selectedGroupIds: prefs.groups.map((g: { id: number }) => g.id) });
          hasGroups = true;
        }
      }

      // Track completed steps and jump to first incomplete
      const completed = new Set<number>();
      if (hasAvatar) completed.add(0);
      if (hasCity) completed.add(1);
      if (hasGroups) completed.add(2);

      const firstIncomplete = !hasAvatar ? 0 : !hasCity ? 1 : !hasGroups ? 2 : 2;
      set({ step: firstIncomplete, completedSteps: completed });
    } catch (e) {
      console.error('[onboarding] hydrate error:', e);
      set({ step: 0 });
    }
  },

  submit: async (token, userId): Promise<boolean> => {
    const { avatarUri, city, selectedGroupIds } = get();
    const hasAnyData = !!avatarUri || !!city || selectedGroupIds.length > 0;
    if (!hasAnyData) return false;

    const isComplete = !!avatarUri && !!city && selectedGroupIds.length > 0;

    set({ isLoading: true, error: null });
    try {
      // 1. Upload avatar if selected — only upload local URIs, not already-uploaded URLs
      if (avatarUri && !avatarUri.startsWith('http')) {
        const publicUrl = await uploadAvatar(userId, avatarUri);
        await apiFetch(`/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar: publicUrl }),
        });
      }

      // 2. Save preferences (city + groups)
      const prefsBody: Record<string, unknown> = {};
      if (city) {
        prefsBody.cityCode = city.code;
        prefsBody.cityName = city.nom;
        prefsBody.cityPostalCode = city.codesPostaux[0] ?? '';
      }
      if (selectedGroupIds.length > 0) {
        prefsBody.groupIds = selectedGroupIds;
      }

      if (Object.keys(prefsBody).length > 0) {
        await apiFetch('/users/me/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prefsBody),
        });
      }

      set({ isLoading: false });
      return isComplete;
    } catch (e: any) {
      console.error('[onboarding] submit error:', e);
      set({ isLoading: false, error: e.message ?? 'Something went wrong' });
      return false;
    }
  },

  reset: () =>
    set({
      step: 0,
      completedSteps: new Set(),
      avatarUri: null,
      city: null,
      selectedGroupIds: [],
      isLoading: false,
      error: null,
    }),
}));
