import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';
import { apiFetch } from '@/utils/api';
import { useAuthStore } from '@/stores/auth-store';
import { getUserIdFromToken } from '@/utils/jwt';
import { uploadAvatar } from '@/constants/supabase';

interface City {
  code: string;
  nom: string;
  codesPostaux: string[];
}

interface KpopGroup {
  id: number;
  name: string;
  slug: string;
}

async function searchCities(query: string): Promise<City[]> {
  if (query.length < 2) return [];
  const res = await fetch(
    `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=code,nom,codesPostaux&limit=5`,
  );
  if (!res.ok) return [];
  return res.json();
}

export default function EditProfileScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const userId = getUserIdFromToken(token);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile fields
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [originalAvatar, setOriginalAvatar] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [email, setEmail] = useState('');
  const [originalEmail, setOriginalEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bio, setBio] = useState('');

  // City
  const [cityQuery, setCityQuery] = useState('');
  const [city, setCity] = useState<{
    code: string;
    name: string;
    postalCode: string;
  } | null>(null);
  const [citySuggestions, setCitySuggestions] = useState<City[]>([]);

  // Fandoms
  const [allGroups, setAllGroups] = useState<KpopGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);

  useEffect(() => {
    if (!token || !userId) return;
    let cancelled = false;
    async function load() {
      try {
        const [profileRes, prefsRes, groupsRes] = await Promise.all([
          apiFetch(`/users/${userId}`),
          apiFetch('/users/me/preferences'),
          apiFetch('/users/me/preferences/groups'),
        ]);

        if (profileRes.ok && !cancelled) {
          const p = await profileRes.json();
          setUsername(p.username);
          setOriginalUsername(p.username);
          setEmail(p.email ?? '');
          setOriginalEmail(p.email ?? '');
          setBio(p.bio ?? '');
          setAvatarUri(p.avatar);
          setOriginalAvatar(p.avatar);
        }
        if (prefsRes.ok && !cancelled) {
          const prefs = await prefsRes.json();
          if (prefs.city?.code) {
            setCity({
              code: prefs.city.code,
              name: prefs.city.nom,
              postalCode: prefs.city.codePostal ?? '',
            });
            setCityQuery(prefs.city.nom);
          }
          if (prefs.groups) {
            setSelectedGroupIds(prefs.groups.map((g: { id: number }) => g.id));
          }
        }
        if (groupsRes.ok && !cancelled) {
          setAllGroups(await groupsRes.json());
        }
      } catch (e) {
        console.error('[EditProfile] Load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  const handlePickAvatar = async () => {
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

  const handleCityChange = async (text: string) => {
    setCityQuery(text);
    setCity(null);
    setCitySuggestions(await searchCities(text));
  };

  const handleSelectCity = (c: City) => {
    setCity({
      code: c.code,
      name: c.nom,
      postalCode: c.codesPostaux[0] ?? '',
    });
    setCityQuery(c.nom);
    setCitySuggestions([]);
  };

  const toggleGroup = (id: number) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    if (!token || !userId) return;
    if (username.trim().length < 2) {
      Alert.alert('Invalid', 'Username must be at least 2 characters');
      return;
    }
    const emailTrimmed = email.trim();
    const emailChanged = emailTrimmed !== originalEmail;
    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      Alert.alert('Invalid', 'Please enter a valid email address');
      return;
    }
    if (password && password.length < 8) {
      Alert.alert('Invalid', 'Password must be at least 8 characters');
      return;
    }
    setSaving(true);

    try {
      // 1. Upload avatar if changed
      let avatarUrl = originalAvatar;
      if (avatarUri && avatarUri !== originalAvatar && !avatarUri.startsWith('http')) {
        avatarUrl = await uploadAvatar(userId, avatarUri);
      } else if (avatarUri === null) {
        avatarUrl = null;
      } else {
        avatarUrl = avatarUri;
      }

      // 2. Update profile (only send changed fields)
      const profileBody: Record<string, unknown> = {
        bio: bio.trim(),
        avatar: avatarUrl ?? undefined,
      };
      if (username.trim() !== originalUsername) {
        profileBody.username = username.trim();
      }
      if (emailChanged) {
        profileBody.email = emailTrimmed;
      }
      if (password) {
        profileBody.password = password;
      }

      const profileRes = await apiFetch(`/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileBody),
      });

      if (profileRes.status === 409) {
        const body = await profileRes.json().catch(() => ({}));
        const msg = String(body.message ?? '').toLowerCase();
        Alert.alert(
          'Taken',
          msg.includes('email')
            ? 'That email is already in use.'
            : 'That username is already taken.',
        );
        setSaving(false);
        return;
      }
      if (!profileRes.ok) {
        Alert.alert('Error', 'Could not save profile.');
        setSaving(false);
        return;
      }

      // 3. Update preferences (city + groups)
      const prefsBody: Record<string, unknown> = {
        groupIds: selectedGroupIds,
      };
      if (city) {
        prefsBody.cityCode = city.code;
        prefsBody.cityName = city.name;
        prefsBody.cityPostalCode = city.postalCode;
      }
      await apiFetch('/users/me/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefsBody),
      });

      router.back();
    } catch (e) {
      console.error('[EditProfile] Save error:', e);
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#EDE7FF', '#F2EDFF']} style={styles.loader}>
        <ActivityIndicator size="large" color={Palette.purple} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#EDE7FF', '#F2EDFF']} style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconSlot}
            hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color={Palette.purple} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit profile</Text>
          <Pressable
            onPress={handleSave}
            style={styles.iconSlot}
            disabled={saving}
            hitSlop={8}>
            {saving ? (
              <ActivityIndicator size="small" color={Palette.purple} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Avatar */}
          <Pressable onPress={handlePickAvatar} style={styles.avatarPicker}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person" size={44} color="#fff" />
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </Pressable>

          {/* Username */}
          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Your username"
              placeholderTextColor="rgba(207, 126, 242, 0.4)"
              autoCapitalize="none"
              maxLength={50}
            />
          </View>

          {/* Email */}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="rgba(207, 126, 242, 0.4)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              maxLength={100}
            />
          </View>

          {/* Password */}
          <View style={styles.field}>
            <Text style={styles.label}>New password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Leave empty to keep current"
              placeholderTextColor="rgba(207, 126, 242, 0.4)"
              secureTextEntry
              autoCapitalize="none"
              maxLength={255}
            />
          </View>

          {/* Bio */}
          <View style={styles.field}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell others about yourself..."
              placeholderTextColor="rgba(207, 126, 242, 0.4)"
              multiline
              maxLength={1000}
              textAlignVertical="top"
            />
          </View>

          {/* City */}
          <View style={styles.field}>
            <Text style={styles.label}>City</Text>
            <TextInput
              style={styles.input}
              value={cityQuery}
              onChangeText={handleCityChange}
              placeholder="Search a city..."
              placeholderTextColor="rgba(207, 126, 242, 0.4)"
            />
            {citySuggestions.length > 0 && !city && (
              <View style={styles.suggestions}>
                {citySuggestions.map((c) => (
                  <Pressable
                    key={c.code}
                    style={({ pressed }) => [
                      styles.suggestionItem,
                      pressed && { backgroundColor: 'rgba(207, 126, 242, 0.1)' },
                    ]}
                    onPress={() => handleSelectCity(c)}>
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color={Palette.purple}
                    />
                    <Text style={styles.suggestionText} numberOfLines={1}>
                      {c.nom}{' '}
                      {c.codesPostaux[0] ? `(${c.codesPostaux[0]})` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Fandoms */}
          <View style={styles.field}>
            <Text style={styles.label}>Fandoms</Text>
            <View style={styles.fandomWrap}>
              {allGroups.map((g) => {
                const selected = selectedGroupIds.includes(g.id);
                return (
                  <Pressable
                    key={g.id}
                    style={({ pressed }) => [
                      styles.fandomChip,
                      selected && styles.fandomChipSelected,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => toggleGroup(g.id)}>
                    <Text
                      style={[
                        styles.fandomText,
                        selected && styles.fandomTextSelected,
                      ]}>
                      {g.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconSlot: {
    minWidth: 50,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: CustomFonts.moyamoya,
    fontSize: 24,
    color: Palette.purple,
    lineHeight: 32,
    paddingTop: 4,
  },
  saveText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 16,
    color: Palette.purple,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 60,
    gap: 20,
    alignItems: 'center',
  },
  avatarPicker: {
    width: 110,
    height: 110,
    marginTop: 8,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  avatarFallback: {
    backgroundColor: Palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#F2EDFF',
  },
  field: {
    width: '100%',
    gap: 6,
  },
  label: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 14,
    color: Palette.purple,
  },
  input: {
    backgroundColor: '#E7FCFE',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: '#E07EFF',
    minHeight: 46,
  },
  textarea: {
    minHeight: 90,
    paddingTop: 12,
  },
  suggestions: {
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.25)',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  suggestionText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  fandomWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fandomChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(207, 126, 242, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.3)',
  },
  fandomChipSelected: {
    backgroundColor: Palette.purple,
    borderColor: Palette.purple,
  },
  fandomText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: Palette.purple,
  },
  fandomTextSelected: {
    color: '#fff',
  },
});
