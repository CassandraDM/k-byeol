import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SlideUpSheet } from '@/components/ui/slide-up-sheet';
import { CustomFonts, Palette } from '@/constants/theme';
import { apiFetch } from '@/utils/api';
import { useAuthStore } from '@/stores/auth-store';
import { uploadAvatar } from '@/constants/supabase';

interface EditProfileSheetProps {
  visible: boolean;
  profile: {
    id: number;
    username: string;
    avatar: string | null;
    bio: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
}

export function EditProfileSheet({
  visible,
  profile,
  onClose,
  onSaved,
}: EditProfileSheetProps) {
  const { token } = useAuthStore();
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(profile.avatar);
  const [saving, setSaving] = useState(false);

  // Reset form when sheet opens
  useEffect(() => {
    if (visible) {
      setUsername(profile.username);
      setBio(profile.bio ?? '');
      setAvatarUri(profile.avatar);
    }
  }, [visible, profile]);

  const pickAvatar = async () => {
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

  const handleSave = async () => {
    if (!token) return;
    if (username.trim().length < 2) {
      Alert.alert('Invalid', 'Username must be at least 2 characters');
      return;
    }
    setSaving(true);
    try {
      let avatarUrl = profile.avatar;
      // Upload new avatar if changed (local URI, not http)
      if (avatarUri && avatarUri !== profile.avatar && !avatarUri.startsWith('http')) {
        avatarUrl = await uploadAvatar(profile.id, avatarUri);
      }

      const res = await apiFetch(`/users/${profile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          avatar: avatarUrl ?? undefined,
          bio: bio.trim(),
        }),
      });

      if (res.ok) {
        onSaved();
      } else if (res.status === 409) {
        Alert.alert('Taken', 'That username is already taken.');
      } else {
        Alert.alert('Error', 'Could not save your profile.');
      }
    } catch (e) {
      console.error('[EditProfile] Error:', e);
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SlideUpSheet visible={visible} onClose={onClose}>
      <View style={styles.content}>
        <Text style={styles.title}>Edit profile</Text>

        {/* Avatar */}
        <Pressable onPress={pickAvatar} style={styles.avatarPicker}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person" size={40} color="#fff" />
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

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.button,
              styles.cancelButton,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.buttonText, styles.cancelText]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.button,
              styles.saveButton,
              pressed && styles.pressed,
              saving && { opacity: 0.7 },
            ]}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save</Text>
            )}
          </Pressable>
        </View>
      </View>
    </SlideUpSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    paddingHorizontal: 24,
    paddingVertical: 8,
    gap: 14,
  },
  title: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 22,
    color: Palette.purple,
    textAlign: 'center',
    lineHeight: 30,
    paddingTop: 2,
  },
  avatarPicker: {
    alignSelf: 'center',
    width: 96,
    height: 96,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarFallback: {
    backgroundColor: Palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  field: {
    gap: 4,
  },
  label: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
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
    minHeight: 80,
    paddingTop: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(207, 126, 242, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.3)',
  },
  saveButton: {
    backgroundColor: Palette.purple,
  },
  buttonText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 18,
    color: '#fff',
  },
  cancelText: {
    color: Palette.purple,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
