import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette, PageBackground } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth-store';
import {
  confirmationMethod,
  deleteMyAccount,
  providerLabel,
} from '@/utils/account';
import {
  releaseSupabaseSession,
  requestSupabaseAccessToken,
  type SocialProvider,
} from '@/utils/social-auth';

/** What the user is about to lose, in the order it will matter to them. */
const CONSEQUENCES = [
  'The events you organised, and their group chats',
  'Your spot in every event you had joined',
  'Your profile, city and fandoms',
  'Everyone you follow, and everyone following you',
];

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { provider, signOut } = useAuthStore();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const method = confirmationMethod(provider);

  /** Signs out and drops the user back at the door. */
  const finish = async () => {
    await signOut();
    router.replace('/(auth)/sign-in' as any);
  };

  const runDeletion = async (
    confirmation: { password: string } | { accessToken: string },
  ) => {
    setBusy(true);
    setError(null);
    const result = await deleteMyAccount(confirmation);
    setBusy(false);

    if (result.status === 'error') {
      setError(result.message);
      return;
    }

    Alert.alert(
      'Account deleted',
      'You can sign up again with the same email whenever you like.',
      [{ text: 'OK', onPress: () => void finish() }],
    );
  };

  /**
   * A social account proves it is really them by going back through the
   * provider — there is no password of theirs to re-type.
   */
  const confirmWithProvider = async () => {
    setBusy(true);
    setError(null);
    const social = await requestSupabaseAccessToken(provider as SocialProvider);
    if (social.status === 'cancelled') {
      setBusy(false);
      return;
    }
    if (social.status === 'error') {
      setBusy(false);
      setError(social.message);
      return;
    }
    setBusy(false);
    await runDeletion({ accessToken: social.accessToken });
    // The token has done its job either way.
    await releaseSupabaseSession();
  };

  /** The last chance to back out, on top of everything above. */
  const askToConfirm = () => {
    if (method === 'password' && !password) {
      setError('Enter your password to confirm.');
      return;
    }

    Alert.alert(
      'Delete your account?',
      'This cannot be undone from the app.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (method === 'password') {
              void runDeletion({ password });
            } else {
              void confirmWithProvider();
            }
          },
        },
      ],
    );
  };

  return (
    <LinearGradient colors={PageBackground} style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.iconSlot}
              hitSlop={8}>
              <Ionicons name="chevron-back" size={28} color={Palette.purple} />
            </Pressable>
            <Text style={styles.headerTitle}>Delete account</Text>
            <View style={styles.iconSlot} />
          </View>

          <View style={styles.card}>
            <Text style={styles.lead}>This deletes for good:</Text>
            {CONSEQUENCES.map((line) => (
              <View key={line} style={styles.bulletRow}>
                <Ionicons name="close-circle" size={16} color="#E74C3C" />
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}

            <View style={styles.divider} />

            <Text style={styles.note}>
              Messages you sent stay in other people’s conversations so their
              threads still make sense, but they stop carrying your name.
            </Text>
            <Text style={styles.note}>
              Your email is freed straight away — you can sign up again with it
              whenever you like.
            </Text>
          </View>

          {method === 'password' ? (
            <View style={styles.card}>
              <Text style={styles.label}>Confirm with your password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setError(null);
                }}
                placeholder="Your password"
                placeholderTextColor="rgba(207,126,242,0.5)"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                editable={!busy}
              />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.label}>
                You signed in with {providerLabel(provider)}
              </Text>
              <Text style={styles.note}>
                You’ll be asked to sign in once more, so we know it’s really
                you.
              </Text>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.deleteButton,
              (pressed || busy) && styles.pressed,
            ]}
            onPress={askToConfirm}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color="#fff" />
                <Text style={styles.deleteText}>Delete my account</Text>
              </>
            )}
          </Pressable>

          <Pressable onPress={() => router.back()} disabled={busy}>
            <Text style={styles.cancel}>Keep my account</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },
  header: {
    paddingTop: 60,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconSlot: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: CustomFonts.moyamoya,
    fontSize: 28,
    color: Palette.purple,
    lineHeight: 38,
    paddingTop: 4,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.2)',
    padding: 16,
    marginTop: 16,
    gap: 10,
  },
  lead: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 16,
    color: Palette.purple,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletText: {
    flex: 1,
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: '#5B3E6E',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(207, 126, 242, 0.2)',
    marginVertical: 4,
  },
  note: {
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: '#6B5478',
    lineHeight: 19,
  },
  label: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 15,
    color: Palette.purple,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: CustomFonts.outfit,
    fontSize: 15,
    color: Palette.input,
  },
  error: {
    marginTop: 14,
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: '#C0392B',
    textAlign: 'center',
  },
  deleteButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    backgroundColor: '#E74C3C',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  deleteText: {
    fontFamily: CustomFonts.syongsyong,
    color: '#fff',
    fontSize: 18,
    letterSpacing: 0.3,
  },
  cancel: {
    marginTop: 18,
    textAlign: 'center',
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.purple,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
