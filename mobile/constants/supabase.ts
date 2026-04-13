import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
 * Uploads an avatar image to Supabase Storage and returns the public URL.
 *
 * @param userId  The user's ID (used to namespace the file)
 * @param uri     The local file URI from image picker
 */
export async function uploadAvatar(userId: number, uri: string): Promise<string> {
  const supabase = getSupabase();
  const ext = uri.split('.').pop() ?? 'jpg';
  const path = `avatars/${userId}-${Date.now()}.${ext}`;

  // Fetch the local file as a blob
  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, {
      contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
      upsert: true,
    });

  if (error) {
    throw new Error(`Avatar upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}
