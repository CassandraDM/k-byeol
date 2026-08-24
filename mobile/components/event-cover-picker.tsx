import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';
import { uploadEventCover } from '@/constants/supabase';

interface EventCoverPickerProps {
  /** Current cover URL, or null when there isn't one yet. */
  value: string | null;
  onChange: (imageUrl: string | null) => void;
  /** Namespaces the uploaded file in storage. */
  userId: number | null;
  /** Lets the parent block submit while the upload is in flight. */
  onUploadingChange?: (uploading: boolean) => void;
}

/**
 * Pick-and-upload control for an event's cover image.
 *
 * Uploads straight to Supabase Storage — the same path avatars take — and
 * hands the resulting public URL back, which is what the events API stores.
 * The cover is optional, so the control also allows removing it.
 */
export function EventCoverPicker({
  value,
  onChange,
  userId,
  onUploadingChange,
}: EventCoverPickerProps) {
  const [uploading, setUploading] = useState(false);

  const setBusy = (busy: boolean) => {
    setUploading(busy);
    onUploadingChange?.(busy);
  };

  const handlePick = async () => {
    if (uploading) return;

    if (!userId) {
      Alert.alert('Not signed in', 'Sign in again to upload a cover image.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo access to choose a cover image.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (result.canceled) return;

    const uri = result.assets[0]?.uri;
    if (!uri) return;

    try {
      setBusy(true);
      onChange(await uploadEventCover(userId, uri));
    } catch (e) {
      console.error('[EventCoverPicker] Upload failed:', e);
      Alert.alert('Upload failed', 'Could not upload that image. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.field}>
      {/* No asterisk — a cover is optional, unlike the other fields. */}
      <Text style={styles.label}>Photos</Text>

      <Pressable
        onPress={handlePick}
        disabled={uploading}
        style={({ pressed }) => [
          styles.frame,
          !value && styles.frameEmpty,
          pressed && styles.pressed,
        ]}>
        {value ? (
          <Image
            source={{ uri: value }}
            style={styles.preview}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="add" size={34} color={Palette.white} />
          </View>
        )}

        {uploading && (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </Pressable>

      {value && !uploading && (
        <View style={styles.actions}>
          <Pressable onPress={handlePick} hitSlop={8}>
            <Text style={styles.actionText}>Change</Text>
          </Pressable>
          <Pressable onPress={() => onChange(null)} hitSlop={8}>
            <Text style={[styles.actionText, styles.removeText]}>Remove</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    alignSelf: 'flex-start',
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: Palette.white,
  },
  frame: {
    width: '100%',
    height: 150,
    borderRadius: 16,
    overflow: 'hidden',
  },
  /** Dashed outline only while empty — a chosen photo fills the frame. */
  frameEmpty: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(231, 252, 254, 0.85)',
  },
  pressed: {
    opacity: 0.85,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  actions: {
    flexDirection: 'row',
    gap: 18,
    paddingTop: 2,
  },
  actionText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 15,
    color: Palette.white,
  },
  removeText: {
    color: Palette.pink,
  },
});
