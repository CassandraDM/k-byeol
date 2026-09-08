import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { HolographicBackground } from '@/components/ui/holographic-background';
import { CodeInput } from '@/components/ui/code-input';
import { useAuthStore } from '@/stores/auth-store';
import { CustomFonts, Palette } from '@/constants/theme';

const RESEND_COOLDOWN = 30; // seconds

/**
 * The second half of bringing a deleted account back: the code sent to the
 * address it used to hold.
 *
 * That mailbox is the point. Somebody who guessed the password got as far as
 * the offer on the sign-in screen; only its owner gets past this.
 */
export default function ReactivateScreen() {
  const router = useRouter();
  const {
    reactivation,
    confirmReactivation,
    requestReactivation,
    clearReactivation,
    isLoading,
    error,
    clearError,
  } = useAuthStore();

  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [seconds, setSeconds] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);

  // Reached without an offer in hand — a reload, or a back-navigation after
  // the offer was declined. There is nothing to confirm.
  useEffect(() => {
    if (!reactivation) {
      router.replace('/(auth)/sign-in' as any);
    }
  }, [reactivation, router]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const handleConfirm = async () => {
    clearError();
    if (code.trim().length !== 6) {
      setFieldError('Enter the 6-digit code from your email.');
      return;
    }
    setFieldError(undefined);
    const ok = await confirmReactivation(code.trim());
    if (ok) {
      // Signed in as the account that was deleted, with everything it owned
      // back where it was. The root layout takes it from here.
      router.replace('/' as any);
    }
  };

  const handleResend = async () => {
    if (seconds > 0 || resending) return;
    clearError();
    setResending(true);
    const outcome = await requestReactivation();
    setResending(false);
    if (outcome === 'code-sent') {
      setCode('');
      setSeconds(RESEND_COOLDOWN);
    }
  };

  const abandon = () => {
    clearReactivation();
    router.replace('/(auth)/sign-in' as any);
  };

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
            <BlurView
              intensity={30}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.cardOverlay} />

            <View style={styles.cardContent}>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>
                We sent a 6-digit code to{'\n'}
                <Text style={styles.emphasis}>
                  {reactivation?.email || 'your email'}
                </Text>
                .
              </Text>

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>6-digit code</Text>
              <CodeInput
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  setFieldError(undefined);
                }}
                error={!!fieldError}
                autoFocus
              />
              {fieldError ? (
                <Text style={styles.fieldError}>{fieldError}</Text>
              ) : null}

              <View style={styles.resendRow}>
                {seconds > 0 ? (
                  <Text style={styles.resendMuted}>
                    Resend code in {seconds}s
                  </Text>
                ) : (
                  <Text style={styles.resendLink} onPress={handleResend}>
                    {resending ? 'Sending…' : 'Resend code'}
                  </Text>
                )}
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleConfirm}
                disabled={isLoading}>
                {isLoading && !resending ? (
                  <ActivityIndicator color={Palette.white} />
                ) : (
                  <Text style={styles.buttonText}>Reactivate my account</Text>
                )}
              </Pressable>

              <Text style={styles.backLink} onPress={abandon}>
                Leave it deleted
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  keyboardView: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  card: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  cardContent: { padding: 26, gap: 10 },
  title: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 30,
    color: Palette.purple,
    lineHeight: 40,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: '#5B3E6E',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 6,
  },
  emphasis: { fontFamily: CustomFonts.outfitSemiBold, color: Palette.purple },
  errorBanner: {
    backgroundColor: 'rgba(231, 76, 60, 0.12)',
    borderRadius: 12,
    padding: 12,
  },
  errorBannerText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: '#C0392B',
    textAlign: 'center',
  },
  label: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 14,
    color: Palette.purple,
    marginTop: 4,
  },
  fieldError: {
    fontFamily: CustomFonts.outfit,
    fontSize: 12,
    color: '#C0392B',
  },
  resendRow: { alignItems: 'center', marginTop: 4 },
  resendMuted: {
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: '#8A7594',
  },
  resendLink: {
    fontFamily: CustomFonts.outfitSemiBold,
    fontSize: 13,
    color: Palette.purple,
  },
  button: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: Palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  buttonText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 18,
    color: Palette.white,
    letterSpacing: 0.3,
  },
  backLink: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: Palette.purple,
  },
});
