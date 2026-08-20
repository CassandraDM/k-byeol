import { BlurView } from "expo-blur";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { HolographicBackground } from "@/components/ui/holographic-background";
import { CodeInput } from "@/components/ui/code-input";
import { useAuthStore } from "@/stores/auth-store";
import { CustomFonts, Palette } from "@/constants/theme";

const RESEND_COOLDOWN = 30; // seconds

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string; send?: string }>();
  const next = typeof params.next === "string" ? params.next : "";

  const { verifyEmail, resendVerification, isLoading, error, clearError } =
    useAuthStore();

  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [seconds, setSeconds] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);
  const requestedOnMount = useRef(false);

  const goNext = useCallback(() => {
    if (next === "onboarding") {
      router.replace("/(onboarding)" as any);
    } else if (next === "tabs") {
      router.replace("/(tabs)" as any);
    } else {
      router.back();
    }
  }, [next, router]);

  const handleAlreadyVerified = useCallback(() => {
    setNotice("Your email is already verified.");
    setTimeout(goNext, 1200);
  }, [goNext]);

  // If arriving from the "create event" gate, request a fresh code once.
  useEffect(() => {
    if (params.send === "true" && !requestedOnMount.current) {
      requestedOnMount.current = true;
      resendVerification().then((result) => {
        if (result === "already-verified") handleAlreadyVerified();
      });
    }
  }, [params.send, resendVerification, handleAlreadyVerified]);

  // Countdown for the "resend" button.
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const handleVerify = async () => {
    clearError();
    if (code.trim().length !== 6) {
      setFieldError("Enter the 6-digit code from your email.");
      return;
    }
    setFieldError(undefined);
    const ok = await verifyEmail(code.trim());
    if (ok) goNext();
  };

  const handleResend = async () => {
    if (seconds > 0 || resending) return;
    clearError();
    setNotice(undefined);
    setResending(true);
    const result = await resendVerification();
    setResending(false);
    if (result === "already-verified") {
      handleAlreadyVerified();
    } else if (result === "sent") {
      setCode("");
      setSeconds(RESEND_COOLDOWN);
    }
  };

  return (
    <View style={styles.root}>
      <HolographicBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
            <View style={styles.cardOverlay} />

            <View style={styles.cardContent}>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.subtitle}>
                We sent a 6-digit code to your email address. Enter it below to
                verify your account.
              </Text>

              {notice ? (
                <View style={styles.noticeBanner}>
                  <Text style={styles.noticeBannerText}>{notice}</Text>
                </View>
              ) : error ? (
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

              {/* Resend with cooldown */}
              <View style={styles.resendRow}>
                {seconds > 0 ? (
                  <Text style={styles.resendMuted}>
                    Resend code in {seconds}s
                  </Text>
                ) : (
                  <Text style={styles.resendLink} onPress={handleResend}>
                    {resending ? "Sending…" : "Resend code"}
                  </Text>
                )}
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleVerify}
                disabled={isLoading}
              >
                {isLoading && !resending ? (
                  <ActivityIndicator color={Palette.white} />
                ) : (
                  <Text style={styles.buttonText}>Verify</Text>
                )}
              </Pressable>

              {!next ? (
                <Text style={styles.backLink} onPress={() => router.back()}>
                  Go back
                </Text>
              ) : null}
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
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  card: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.20)",
  },
  cardContent: { padding: 28 },

  title: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 32,
    color: Palette.pink,
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 14,
    color: Palette.white,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 22,
  },

  errorBanner: {
    backgroundColor: "rgba(193, 0, 80, 0.12)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(193, 0, 80, 0.25)",
  },
  errorBannerText: {
    color: "#C10050",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  noticeBanner: {
    backgroundColor: "rgba(46, 160, 87, 0.14)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(46, 160, 87, 0.3)",
  },
  noticeBannerText: {
    color: "#1E6B2F",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },

  label: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 16,
    color: Palette.white,
    marginBottom: 6,
  },
  fieldError: { color: "#C10050", fontSize: 12, marginTop: 4 },

  resendRow: {
    marginTop: 12,
    alignItems: "center",
  },
  resendMuted: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: Palette.white,
    opacity: 0.7,
  },
  resendLink: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: Palette.pink,
    textDecorationLine: "underline",
  },

  button: {
    marginTop: 24,
    alignSelf: "flex-end",
    backgroundColor: Palette.purple,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 36,
    shadowColor: Palette.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  buttonText: {
    fontFamily: CustomFonts.syongsyong,
    color: Palette.white,
    fontSize: 20,
    letterSpacing: 0.3,
  },

  backLink: {
    fontFamily: CustomFonts.moyamoya,
    marginTop: 20,
    fontSize: 13,
    color: Palette.white,
    textAlign: "center",
    textDecorationLine: "underline",
  },
});
