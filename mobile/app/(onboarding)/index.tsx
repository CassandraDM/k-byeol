import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HolographicBackground } from '@/components/ui/holographic-background';
import { CustomFonts, Palette } from '@/constants/theme';
import { API_URL } from '@/constants/api';
import { useAuthStore } from '@/stores/auth-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { getUserIdFromToken } from '@/utils/jwt';

// ─── City search helper ────────────────────────────────────────────────────────
interface City {
  code: string;
  nom: string;
  codesPostaux: string[];
}

async function searchCities(query: string): Promise<City[]> {
  if (query.length < 2) return [];
  const res = await fetch(
    `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=code,nom,codesPostaux&limit=5`,
  );
  if (!res.ok) return [];
  return res.json();
}

// ─── Group type ────────────────────────────────────────────────────────────────
interface KpopGroup {
  id: number;
  name: string;
  slug: string;
}

// ─── Step 0: Avatar ────────────────────────────────────────────────────────────
function StepAvatar() {
  const { avatarUri, setAvatarUri, nextStep } = useOnboardingStore();
  const { token } = useAuthStore();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleNext = async () => {
    // Upload avatar immediately so it persists
    if (avatarUri && !avatarUri.startsWith('http') && token) {
      setUploading(true);
      try {
        const userId = getUserIdFromToken(token) ?? 0;
        const publicUrl = await uploadAvatar(userId, avatarUri);
        await fetch(`${API_URL}/users/${userId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ avatar: publicUrl }),
        });
        setAvatarUri(publicUrl);
      } catch (e) {
        console.error('[onboarding] Avatar upload error:', e);
      } finally {
        setUploading(false);
      }
    }
    nextStep();
  };

  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  return (
    <>
      <Text style={styles.stepTitle}>Choose your{'\n'}profile picture</Text>
      <Text style={styles.stepSubtitle}>Show the world who you are!</Text>

      <Pressable style={styles.avatarContainer} onPress={pickImage}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="camera-outline" size={40} color={Palette.purple} />
          </View>
        )}
        <View style={styles.avatarBadge}>
          <Ionicons name="add" size={18} color={Palette.white} />
        </View>
      </Pressable>

      <View style={styles.buttonRow}>
        <Pressable
          style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
          onPress={handleSkip}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            (!avatarUri && !uploading) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleNext}
          disabled={!avatarUri || uploading}>
          {uploading ? (
            <ActivityIndicator color={Palette.white} />
          ) : (
            <Text style={styles.buttonText}>Next</Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

// ─── Step 1: City ──────────────────────────────────────────────────────────────
function StepCity() {
  const { city, setCity, nextStep, prevStep, step, completedSteps } = useOnboardingStore();
  const { token } = useAuthStore();
  const hasPrevIncomplete = Array.from({ length: step }, (_, i) => i).some((i) => !completedSteps.has(i));
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState(city?.nom ?? '');
  const [results, setResults] = useState<City[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    setCity(null);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const cities = await searchCities(text);
    setResults(cities);
    setSearching(false);
  }, []);

  const selectCity = (c: City) => {
    setCity(c);
    setQuery(c.nom);
    setResults([]);
  };

  const handleNext = async () => {
    // Save city immediately so it persists
    if (city && token) {
      setSaving(true);
      try {
        await fetch(`${API_URL}/users/me/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            cityCode: city.code,
            cityName: city.nom,
            cityPostalCode: city.codesPostaux[0] ?? '',
          }),
        });
      } catch (e) {
        console.error('[onboarding] City save error:', e);
      } finally {
        setSaving(false);
      }
    }
    nextStep();
  };

  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  return (
    <>
      <Text style={styles.stepTitle}>Where are you?</Text>
      <Text style={styles.stepSubtitle}>Find events near you</Text>

      <View style={styles.inputWrapper}>
        <Ionicons name="location-outline" size={20} color={Palette.purple} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleSearch}
          placeholder="Search your city..."
          placeholderTextColor="#DAC5EA"
          autoCorrect={false}
        />
        {searching && <ActivityIndicator size="small" color={Palette.purple} />}
      </View>

      {results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map((c) => (
            <Pressable key={c.code} style={styles.dropdownItem} onPress={() => selectCity(c)}>
              <Text style={styles.dropdownText}>
                {c.nom} ({c.codesPostaux[0]})
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {city && (
        <View style={styles.selectedChip}>
          <Ionicons name="checkmark-circle" size={16} color={Palette.purple} />
          <Text style={styles.selectedChipText}>{city.nom}</Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <Pressable
          style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
          onPress={handleSkip}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {hasPrevIncomplete && (
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
              onPress={prevStep}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              (!city && !saving) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleNext}
            disabled={!city || saving}>
            {saving ? (
              <ActivityIndicator color={Palette.white} />
            ) : (
              <Text style={styles.buttonText}>Next</Text>
            )}
          </Pressable>
        </View>
      </View>
    </>
  );
}

// ─── Step 2: Groups ────────────────────────────────────────────────────────────
function StepGroups() {
  const { selectedGroupIds, toggleGroup, prevStep, submit, isLoading, step, completedSteps } = useOnboardingStore();
  const hasPrevIncomplete = Array.from({ length: step }, (_, i) => i).some((i) => !completedSteps.has(i));
  const { token, setOnboardingComplete } = useAuthStore();
  const router = useRouter();

  const [groups, setGroups] = useState<KpopGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [requestName, setRequestName] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/users/me/preferences/groups`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setGroups(data);
        }
      } catch (e) {
        console.error('[onboarding] Failed to load groups:', e);
      } finally {
        setLoadingGroups(false);
      }
    })();
  }, []);

  const handleRequestGroup = async () => {
    if (!requestName.trim()) return;
    try {
      await fetch(`${API_URL}/users/me/preferences/groups/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: requestName.trim() }),
      });
      setRequestSent(true);
      setRequestName('');
    } catch (e) {
      console.error('[onboarding] Failed to request group:', e);
    }
  };

  const handleDone = async () => {
    // Decode userId from JWT (payload.sub)
    let userId = 0;
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userId = payload.sub;
      } catch { /* fallback */ }
    }
    const saved = await submit(token!, userId);
    if (saved) {
      await setOnboardingComplete();
    }
    router.replace('/(tabs)');
  };

  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  return (
    <>
      <Text style={styles.stepTitle}>Pick your{'\n'}favorite groups</Text>
      <Text style={styles.stepSubtitle}>We'll show you what matters</Text>

      {loadingGroups ? (
        <ActivityIndicator size="large" color={Palette.purple} style={{ marginVertical: 24 }} />
      ) : (
        <View style={styles.groupGrid}>
          {groups.map((g) => {
            const selected = selectedGroupIds.includes(g.id);
            return (
              <Pressable
                key={g.id}
                style={[styles.groupChip, selected && styles.groupChipSelected]}
                onPress={() => toggleGroup(g.id)}>
                <Text style={[styles.groupChipText, selected && styles.groupChipTextSelected]}>
                  {g.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={styles.requestLabel}>Can't find your group?</Text>
      {requestSent ? (
        <Text style={styles.requestSuccess}>Request sent! We'll review it soon.</Text>
      ) : (
        <View style={styles.requestRow}>
          <TextInput
            style={styles.requestInput}
            value={requestName}
            onChangeText={setRequestName}
            placeholder="Group name..."
            placeholderTextColor="#DAC5EA"
            autoCorrect={false}
          />
          <Pressable
            style={({ pressed }) => [styles.requestButton, pressed && styles.buttonPressed]}
            onPress={handleRequestGroup}>
            <Ionicons name="send" size={16} color={Palette.white} />
          </Pressable>
        </View>
      )}

      <View style={styles.buttonRow}>
        <Pressable
          style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
          onPress={handleSkip}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {hasPrevIncomplete && (
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
              onPress={prevStep}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              (selectedGroupIds.length === 0 && !isLoading) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleDone}
            disabled={selectedGroupIds.length === 0 || isLoading}>
            {isLoading ? (
              <ActivityIndicator color={Palette.white} />
            ) : (
              <Text style={styles.buttonText}>Done</Text>
            )}
          </Pressable>
        </View>
      </View>
    </>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const { step, hydrate, completedSteps } = useOnboardingStore();
  const { token } = useAuthStore();

  useFocusEffect(
    useCallback(() => {
      if (token) {
        hydrate(token);
      }
    }, [token]),
  );

  return (
    <View style={styles.root}>
      <HolographicBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
            <View style={styles.cardOverlay} />
            <View style={styles.cardContent}>
              {/* Step indicator — only show incomplete steps */}
              <View style={styles.stepIndicator}>
                {[0, 1, 2].filter((i) => !completedSteps.has(i)).map((i) => (
                  <View
                    key={i}
                    style={[styles.dot, i === step && styles.dotActive]}
                  />
                ))}
              </View>

              {step === 0 && <StepAvatar />}
              {step === 1 && <StepCity />}
              {step === 2 && <StepGroups />}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  keyboardView: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  // Card
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
  },
  cardContent: { padding: 28 },

  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(207, 126, 242, 0.3)',
  },
  dotActive: {
    backgroundColor: Palette.purple,
    width: 24,
  },
  dotDone: {
    backgroundColor: Palette.purple,
  },

  // Step content
  stepTitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 28,
    color: Palette.pink,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 14,
    color: Palette.white,
    textAlign: 'center',
    marginBottom: 24,
  },

  // Avatar
  avatarContainer: {
    alignSelf: 'center',
    marginBottom: 32,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(207, 126, 242, 0.15)',
    borderWidth: 2,
    borderColor: Palette.purple,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: Palette.purple,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Palette.white,
  },

  // City search
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.white,
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#E07EFF',
    fontFamily: CustomFonts.syongsyong,
  },
  dropdown: {
    backgroundColor: Palette.white,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(207, 126, 242, 0.15)',
  },
  dropdownText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 15,
    color: '#E07EFF',
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginBottom: 16,
  },
  selectedChipText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 14,
    color: Palette.purple,
  },

  // Groups
  groupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 24,
  },
  groupChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Palette.purple,
    backgroundColor: 'transparent',
  },
  groupChipSelected: {
    backgroundColor: Palette.purple,
  },
  groupChipText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 14,
    color: Palette.purple,
  },
  groupChipTextSelected: {
    color: Palette.white,
  },

  // Group request
  requestLabel: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: Palette.white,
    textAlign: 'center',
    marginBottom: 8,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  requestInput: {
    flex: 1,
    backgroundColor: Palette.white,
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#E07EFF',
    fontFamily: CustomFonts.syongsyong,
  },
  requestButton: {
    backgroundColor: Palette.purple,
    borderRadius: 10,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestSuccess: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: Palette.purple,
    textAlign: 'center',
    marginBottom: 8,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  button: {
    backgroundColor: Palette.purple,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 28,
    shadowColor: Palette.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    fontFamily: CustomFonts.syongsyong,
    color: Palette.white,
    fontSize: 18,
  },
  backButton: {
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: Palette.purple,
  },
  backButtonText: {
    fontFamily: CustomFonts.syongsyong,
    color: Palette.purple,
    fontSize: 18,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  skipButtonText: {
    fontFamily: CustomFonts.moyamoya,
    color: Palette.white,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
