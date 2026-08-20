import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { HolographicBackground } from "@/components/ui/holographic-background";
import { useAuthStore } from "@/stores/auth-store";
import { CustomFonts, Palette } from "@/constants/theme";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { forgotPassword, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();

  const handleSubmit = async () => {
    clearError();
    if (!email.trim()) {
      setFieldError("Email is required.");
      return;
    }
    if (!isValidEmail(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError(undefined);
    const ok = await forgotPassword(email.trim());
    if (ok) {
      // Go straight to the code screen — it carries the email for "resend".
      router.push(
        `/(auth)/verify-code?email=${encodeURIComponent(email.trim())}` as any,
      );
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
              <Text style={styles.title}>Forgot password?</Text>
              <Text style={styles.subtitle}>
                Enter the email tied to your account and we&apos;ll send you a
                6-digit code to reset your password.
              </Text>

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, fieldError ? styles.inputError : null]}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setFieldError(undefined);
                }}
                placeholder="midzy@email.com"
                placeholderTextColor="#DAC5EA"
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
              {fieldError ? (
                <Text style={styles.fieldError}>{fieldError}</Text>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={Palette.white} />
                ) : (
                  <Text style={styles.buttonText}>Send code</Text>
                )}
              </Pressable>

              <Text style={styles.backLink} onPress={() => router.back()}>
                Back to log in
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

  label: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 16,
    color: Palette.white,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Palette.white,
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#E07EFF",
    fontFamily: CustomFonts.syongsyong,
  },
  inputError: { borderWidth: 1.5, borderColor: "#C10050" },
  fieldError: { color: "#C10050", fontSize: 12, marginTop: 4 },

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
