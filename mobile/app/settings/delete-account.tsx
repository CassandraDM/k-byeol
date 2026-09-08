import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
  GRACE_PERIOD_DAYS,
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
  /**
   * The confirmation is a dialog rather than a field sitting on the page.
   * Asking for a password on arrival reads as a demand made of somebody who
   * has not decided anything yet; asking it in a sheet that opens on the press
   * reads as the step it actually is, and it cannot be half-filled in and
   * forgotten.
   */
  const [asking, setAsking] = useState(false);

  const method = confirmationMethod(provider);

  /** Signs out and drops the user back at the door. */
  const finish = async () => {
    await signOut();
    router.replace('/(auth)/sign-in' as any);
  };

  const close = () => {
    setAsking(false);
    setPassword('');
    setError(null);
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

    setAsking(false);
    Alert.alert(
      'Account deleted',
      `You can sign up again with the same email whenever you like. Change your mind? Sign in within ${result.gracePeriodDays} days and we'll offer to bring this account back.`,
      [{ text: 'OK', onPress: () => void finish() }],
    );
  };

  const confirmWithPassword = () => {
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }
    void runDeletion({ password });
  };

  /**
   * A social account proves it is really them by going back through the
   * provider — there is no password of theirs to re-type.
   */
  const confirmWithProvider = async () => {
    setBusy(true);
    setError(null);
    const social = await requestSupabaseAccessToken(provider as SocialProvider);
    if (social.status !== 'ok') {
      setBusy(false);
      if (social.status === 'error') setError(social.message);
      return;
    }
    setBusy(false);
    await runDeletion({ accessToken: social.accessToken });
    // The token has done its job either way.
    await releaseSupabaseSession();
  };

  return (
    <LinearGradient colors={PageBackground} style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
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
          {/* Not "for good" any more: none of this is destroyed until the
              grace period runs out, so the honest word is "lose". */}
          <Text style={styles.lead}>You’ll lose:</Text>
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
            Changed your mind? Sign in again within {GRACE_PERIOD_DAYS} days and
            we’ll offer to bring everything back, exactly as you left it. After{' '}
            {GRACE_PERIOD_DAYS} days it’s gone for good.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && styles.pressed,
          ]}
          onPress={() => setAsking(true)}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.deleteText}>Delete my account</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={asking}
        transparent
        animationType="fade"
        // Android's hardware back and iOS's swipe both mean "not this".
        onRequestClose={close}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.dialog}>
            {method === 'password' ? (
              <>
                <Text style={styles.dialogTitle}>
                  Confirm with your password
                </Text>
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
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={confirmWithPassword}
                />
              </>
            ) : (
              <>
                <Text style={styles.dialogTitle}>
                  Sign in with {providerLabel(provider)} to confirm
                </Text>
                <Text style={styles.note}>
                  You’ll be asked to sign in once more, so we know it’s really
                  you.
                </Text>
              </>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.dialogButton,
                  styles.cancelButton,
                  pressed && styles.pressed,
                ]}
                onPress={close}
                disabled={busy}>
                <Text style={styles.cancelText}>Keep my account</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.dialogButton,
                  styles.confirmButton,
                  (pressed || busy) && styles.pressed,
                ]}
                onPress={
                  method === 'password'
                    ? confirmWithPassword
                    : () => void confirmWithProvider()
                }
                disabled={busy}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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

  // ── Confirmation dialog ──────────────────────────────────────────────────
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(40, 20, 55, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    backgroundColor: '#F7F2FF',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  dialogTitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 17,
    color: Palette.purple,
    lineHeight: 24,
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
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: '#C0392B',
  },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dialogButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancelButton: {
    backgroundColor: 'rgba(207, 126, 242, 0.12)',
  },
  cancelText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.purple,
  },
  confirmButton: { backgroundColor: '#E74C3C' },
  confirmText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 16,
    color: '#fff',
    letterSpacing: 0.3,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
