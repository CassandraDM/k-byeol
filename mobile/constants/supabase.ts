import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeBase64 } from 'base64-arraybuffer';

const SUPABASE_URL = 'https://jictcppytorltywhnmjf.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    if (!SUPABASE_ANON_KEY) {
      throw new Error(
        'Missing EXPO_PUBLIC_SUPABASE_ANON_KEY. Add it to your .env file.',
      );
    }
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

/**
 * Reads a local file URI as an ArrayBuffer.
 *
 * On React Native / Expo, `fetch(localUri).blob()` often returns an empty blob,
 * so we read the file as base64 via expo-file-system and decode it to an
 * ArrayBuffer, which Supabase Storage accepts.
 */
async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeBase64(base64);
}

function extensionFromUri(uri: string): string {
  const raw = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (raw === 'png' || raw === 'jpg' || raw === 'jpeg' || raw === 'webp') {
    return raw === 'jpg' ? 'jpeg' : raw;
  }
  return 'jpeg';
}

/**
 * Uploads an avatar image to Supabase Storage and returns the public URL.
 */
export async function uploadAvatar(userId: number, uri: string): Promise<string> {
  const supabase = getSupabase();
  const ext = extensionFromUri(uri);
  const path = `avatars/${userId}-${Date.now()}.${ext}`;

  const arrayBuffer = await readUriAsArrayBuffer(uri);

  const { error } = await supabase.storage.from('avatars').upload(path, arrayBuffer, {
    contentType: `image/${ext}`,
    upsert: true,
  });

  if (error) {
    throw new Error(`Avatar upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Uploads an event cover image to Supabase Storage and returns the public URL.
 */
export async function uploadEventCover(userId: number, uri: string): Promise<string> {
  const supabase = getSupabase();
  const ext = extensionFromUri(uri);
  const path = `events/${userId}-${Date.now()}.${ext}`;

  const arrayBuffer = await readUriAsArrayBuffer(uri);

  const { error } = await supabase.storage.from('avatars').upload(path, arrayBuffer, {
    contentType: `image/${ext}`,
    upsert: true,
  });

  if (error) {
    throw new Error(`Event cover upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}
