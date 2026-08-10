import { BlurView } from "expo-blur";
import { useLocalSearchParams, useRouter } from "expo-router";
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

const isValidPassword = (v: string) => v.length >= 8;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const { resetPassword, isLoading, error, clearError } = useAuthStore();

  // Token can arrive from the email deep link (mobile://reset-password?token=…)
  // or be pasted manually when the link can't open the app.
  const tokenFromLink = typeof params.token === "string" ? params.token : "";

  const [token, setToken] = useState(tokenFromLink);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    token?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [done, setDone] = useState(false);

  const validate = () => {
    const errors: typeof fieldErrors = {};
    if (!token.trim()) errors.token = "Paste the code from your email.";
    if (!password) errors.password = "Password is required.";
    else if (!isValidPassword(password))
      errors.password = "Password must be at least 8 characters.";
    if (!confirm) errors.confirm = "Please confirm your password.";
    else if (confirm !== password) errors.confirm = "Passwords do not match.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    clearError();
    if (!validate()) return;
    const ok = await resetPassword(token.trim(), password);
    if (ok) setDone(true);
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
              <Text style={styles.title}>New password</Text>

              {done ? (
                <>
                  <Text style={styles.subtitle}>
                    Your password has been reset 🎉{"\n"}You can now log in with
                    your new password.
                  </Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.button,
                      styles.buttonFull,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => router.replace("/(auth)/sign-in" as any)}
                  >
                    <Text style={styles.buttonText}>Log in</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.subtitle}>
                    Choose a new password for your account.
                  </Text>

                  {error ? (
                    <View style={styles.errorBanner}>
                      <Text
                        style={[
                          styles.errorBannerText,
                          error.includes("\n") && styles.errorBannerList,
                        ]}
                      >
                        {error}
                      </Text>
                    </View>
                  ) : null}

                  {/* Code — hidden once it arrives via the deep link */}
                  {!tokenFromLink ? (
                    <>
                      <Text style={styles.label}>Reset code</Text>
                      <TextInput
                        style={[
                          styles.input,
                          fieldErrors.token ? styles.inputError : null,
                        ]}
                        value={token}
                        onChangeText={(v) => {
                          setToken(v);
                          setFieldErrors((e) => ({ ...e, token: undefined }));
                        }}
                        placeholder="Paste the code from your email"
                        placeholderTextColor="#DAC5EA"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {fieldErrors.token ? (
                        <Text style={styles.fieldError}>{fieldErrors.token}</Text>
                      ) : null}
                    </>
                  ) : null}

                  <Text
                    style={[
                      styles.label,
                      !tokenFromLink ? { marginTop: 14 } : null,
                    ]}
                  >
                    New password
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      fieldErrors.password ? styles.inputError : null,
                    ]}
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      setFieldErrors((e) => ({ ...e, password: undefined }));
                    }}
                    placeholder="********"
                    placeholderTextColor="#DAC5EA"
                    secureTextEntry
                  />
                  {fieldErrors.password ? (
                    <Text style={styles.fieldError}>{fieldErrors.password}</Text>
                  ) : null}

                  <Text style={[styles.label, { marginTop: 14 }]}>
                    Confirm password
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      fieldErrors.confirm ? styles.inputError : null,
                    ]}
                    value={confirm}
                    onChangeText={(v) => {
                      setConfirm(v);
                      setFieldErrors((e) => ({ ...e, confirm: undefined }));
                    }}
                    placeholder="********"
                    placeholderTextColor="#DAC5EA"
                    secureTextEntry
                  />
                  {fieldErrors.confirm ? (
                    <Text style={styles.fieldError}>{fieldErrors.confirm}</Text>
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
                      <Text style={styles.buttonText}>Reset password</Text>
                    )}
                  </Pressable>

                  <Text
                    style={styles.backLink}
                    onPress={() => router.replace("/(auth)/sign-in" as any)}
                  >
                    Back to log in
                  </Text>
                </>
              )}
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
  errorBannerList: { textAlign: "left" },

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
  buttonFull: { alignSelf: "stretch", alignItems: "center" },
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
