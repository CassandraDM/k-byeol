import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";

import { HolographicBackground } from "@/components/ui/holographic-background";
import { WelcomeText } from "@/components/ui/welcome-text";
import { useAuthStore } from "@/stores/auth-store";
import { CustomFonts, Palette } from "@/constants/theme";

const EASING = Easing.bezier(0.4, 0, 0.2, 1);

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isValidPassword = (v: string) => v.length >= 8;

type Mode = "sign-in" | "sign-up";

// ─── Reusable animated field section hook ────────────────────────────────────
function useAnimatedField(mode: Mode, visibleIn: Mode) {
  const [naturalHeight, setNaturalHeight] = useState(0);
  const animHeight = useSharedValue(0);
  const animOpacity = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && naturalHeight === 0) setNaturalHeight(h);
  };

  useEffect(() => {
    if (naturalHeight === 0) return;
    const show = mode === visibleIn;
    animHeight.value = withTiming(show ? naturalHeight : 0, {
      duration: 380,
      easing: EASING,
    });
    animOpacity.value = withTiming(show ? 1 : 0, {
      duration: show ? 320 : 200,
    });
  }, [mode, naturalHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: animHeight.value,
    opacity: animOpacity.value,
    overflow: "hidden",
  }));

  return { onLayout, animatedStyle, measured: naturalHeight > 0 };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function SignInScreen() {
  const router = useRouter();
  const { signIn, signUp, socialSignIn, isLoading, error, clearError } =
    useAuthStore();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
    confirm?: string;
  }>({});

  // Animated sections
  const usernameField = useAnimatedField(mode, "sign-up");
  const confirmField = useAnimatedField(mode, "sign-up");

  // ── Toggle text animation ────────────────────────────────────────────────
  const toggleOpacity = useSharedValue(1);
  const toggleTranslateY = useSharedValue(0);
  const [visibleMode, setVisibleMode] = useState<Mode>("sign-in");
  const animatedToggleStyle = useAnimatedStyle(() => ({
    opacity: toggleOpacity.value,
    transform: [{ translateY: toggleTranslateY.value }],
  }));

  const toggleMode = () => {
    const next: Mode = mode === "sign-in" ? "sign-up" : "sign-in";

    // Animate toggle text
    toggleOpacity.value = withTiming(0, { duration: 160, easing: EASING });
    toggleTranslateY.value = withTiming(
      -8,
      { duration: 160, easing: EASING },
      () => {
        runOnJS(setVisibleMode)(next);
        toggleTranslateY.value = 8;
        toggleOpacity.value = withTiming(1, { duration: 200, easing: EASING });
        toggleTranslateY.value = withTiming(0, {
          duration: 200,
          easing: EASING,
        });
      },
    );

    setMode(next);
    setFieldErrors({});
    setUsername("");
    setConfirm("");
    clearError();
  };

  const validate = () => {
    const errors: typeof fieldErrors = {};
    if (mode === "sign-up" && !username.trim())
      errors.username = "Username is required.";
    if (!email.trim()) errors.email = "Email is required.";
    else if (!isValidEmail(email))
      errors.email = "Enter a valid email address.";
    if (!password) errors.password = "Password is required.";
    else if (!isValidPassword(password))
      errors.password = "Password must be at least 8 characters.";
    if (mode === "sign-up") {
      if (!confirm) errors.confirm = "Please confirm your password.";
      else if (confirm !== password) errors.confirm = "Passwords do not match.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    clearError();
    if (!validate()) return;
    if (mode === "sign-in") {
      await signIn(email, password);
    } else {
      await signUp(username, email, password);
    }
    const { isAuthenticated, isNewUser, emailVerified } =
      useAuthStore.getState();
    if (isAuthenticated) {
      if (isNewUser) {
        // New accounts must check their email; verification leads to onboarding.
        router.replace("/(auth)/verify-email?next=onboarding" as any);
      } else if (!emailVerified) {
        // Returning but unverified → must verify before entering the app.
        router.replace("/(auth)/verify-prompt" as any);
      } else {
        router.replace("/(tabs)");
      }
    }
  };

  const handleSocial = async (provider: "google" | "apple") => {
    clearError();
    const ok = await socialSignIn(provider);
    if (ok) {
      // Social accounts are email-verified; new ones still do onboarding.
      const { isNewUser } = useAuthStore.getState();
      router.replace(isNewUser ? ("/(onboarding)" as any) : "/(tabs)");
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
            <BlurView
              intensity={30}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.cardOverlay} />

            <View style={styles.cardContent}>
              <WelcomeText style={styles.title} />

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={[
                    styles.errorBannerText,
                    error.includes('\n') && styles.errorBannerList,
                  ]}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {/* Username — animated, sign-up only */}
              <Animated.View style={usernameField.animatedStyle}>
                {!usernameField.measured && (
                  <View
                    style={[styles.ghost, { paddingBottom: 14 }]}
                    onLayout={usernameField.onLayout}
                  >
                    <Text style={styles.label}>Username</Text>
                    <TextInput style={styles.input} editable={false} />
                  </View>
                )}
                <View
                  onLayout={
                    usernameField.measured ? usernameField.onLayout : undefined
                  }
                  style={{ paddingBottom: 14 }}
                >
                  <Text style={styles.label}>Username</Text>
                  <TextInput
                    style={[
                      styles.input,
                      fieldErrors.username ? styles.inputError : null,
                    ]}
                    value={username}
                    onChangeText={(v) => {
                      setUsername(v);
                      setFieldErrors((e) => ({ ...e, username: undefined }));
                    }}
                    placeholder="midzy0708"
                    placeholderTextColor="#DAC5EA"
                    autoCapitalize="none"
                    autoCorrect={false}
                    pointerEvents={mode === "sign-up" ? "auto" : "none"}
                  />
                  {fieldErrors.username ? (
                    <Text style={styles.fieldError}>
                      {fieldErrors.username}
                    </Text>
                  ) : null}
                </View>
              </Animated.View>

              {/* Email */}
              <Text style={styles.label}>
                {mode === "sign-in" ? "Username / Email" : "Email"}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  fieldErrors.email ? styles.inputError : null,
                ]}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setFieldErrors((e) => ({ ...e, email: undefined }));
                }}
                placeholder="midzy@email.com"
                placeholderTextColor="#DAC5EA"
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
              {fieldErrors.email ? (
                <Text style={styles.fieldError}>{fieldErrors.email}</Text>
              ) : null}

              {/* Password */}
              <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
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

              {/* Forgot password — sign-in only */}
              {mode === "sign-in" ? (
                <Text
                  style={styles.forgotLink}
                  onPress={() =>
                    router.push("/(auth)/forgot-password" as any)
                  }
                >
                  Forgot password?
                </Text>
              ) : null}

              {/* Confirm password — animated, sign-up only */}
              <Animated.View style={confirmField.animatedStyle}>
                {!confirmField.measured && (
                  <View style={styles.ghost} onLayout={confirmField.onLayout}>
                    <Text style={[styles.label, { marginTop: 14 }]}>
                      Confirm Password
                    </Text>
                    <TextInput style={styles.input} editable={false} />
                  </View>
                )}
                <View
                  onLayout={
                    confirmField.measured ? confirmField.onLayout : undefined
                  }
                >
                  <Text style={[styles.label, { marginTop: 14 }]}>
                    Confirm Password
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
                    pointerEvents={mode === "sign-up" ? "auto" : "none"}
                  />
                  {fieldErrors.confirm ? (
                    <Text style={styles.fieldError}>{fieldErrors.confirm}</Text>
                  ) : null}
                </View>
              </Animated.View>

              {/* Toggle text — animated fade + slide */}
              <Animated.View style={animatedToggleStyle}>
                {visibleMode === "sign-in" ? (
                  <Text style={styles.toggleText}>
                    First time? What are you waiting for to{" "}
                    <Text style={styles.toggleLink} onPress={toggleMode}>
                      create an account
                    </Text>
                    ?
                  </Text>
                ) : (
                  <Text style={styles.toggleText}>
                    Already have an account?{" "}
                    <Text style={styles.toggleLink} onPress={toggleMode}>
                      Log in
                    </Text>
                  </Text>
                )}
              </Animated.View>

              {/* Submit */}
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
                  <Text style={styles.buttonText}>
                    {mode === "sign-in" ? "Log In" : "Sign Up"}
                  </Text>
                )}
              </Pressable>

              {/* Social login */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.socialButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => handleSocial("google")}
                disabled={isLoading}
              >
                <Ionicons name="logo-google" size={18} color="#333" />
                <Text style={styles.socialButtonText}>
                  Continue with Google
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.socialButton,
                  styles.appleButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => handleSocial("apple")}
                disabled={isLoading}
              >
                <Ionicons name="logo-apple" size={18} color="#fff" />
                <Text style={[styles.socialButtonText, styles.appleButtonText]}>
                  Continue with Apple
                </Text>
              </Pressable>
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

  // ── Card ──────────────────────────────────────────────────────────────────
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

  // ── Title ─────────────────────────────────────────────────────────────────
  title: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 36,
    color: Palette.pink,
    textAlign: "center",
    marginBottom: 24,
    letterSpacing: 0.5,
  },

  // ── Error banner ──────────────────────────────────────────────────────────
  errorBanner: {
    backgroundColor: "rgba(193, 0, 80, 0.12)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(193, 0, 80, 0.25)",
  },
  errorBannerText: { color: "#C10050", fontSize: 12, textAlign: "center", lineHeight: 18 },
  errorBannerList: { textAlign: "left" },

  // ── Fields ────────────────────────────────────────────────────────────────
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
    // Explicit reset — prevents Fabric view-recycling from carrying over the
    // code field's letterSpacing onto these inputs.
    letterSpacing: 0,
  },
  inputError: { borderWidth: 1.5, borderColor: "#C10050" },
  fieldError: { color: "#C10050", fontSize: 12, marginTop: 4 },

  // Ghost view for height measurement (invisible, absolute)
  ghost: { position: "absolute", opacity: 0, width: "100%" },

  // ── Toggle link ───────────────────────────────────────────────────────────
  toggleText: {
    fontFamily: CustomFonts.moyamoya,
    marginTop: 18,
    fontSize: 12,
    color: Palette.white,
    textAlign: "center",
    lineHeight: 18,
  },
  toggleLink: {
    fontFamily: CustomFonts.moyamoya,
    color: Palette.pink,
    textDecorationLine: "underline",
  },
  forgotLink: {
    fontFamily: CustomFonts.moyamoya,
    color: Palette.white,
    fontSize: 12,
    textAlign: "right",
    textDecorationLine: "underline",
    marginTop: 8,
  },

  // ── Button ────────────────────────────────────────────────────────────────
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

  // ── Social login ──────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 22,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  dividerText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 12,
    color: Palette.white,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Palette.white,
    borderRadius: 12,
    height: 48,
    marginBottom: 10,
  },
  socialButtonText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 15,
    color: "#333",
  },
  appleButton: {
    backgroundColor: "#000",
  },
  appleButtonText: {
    color: "#fff",
  },
});
