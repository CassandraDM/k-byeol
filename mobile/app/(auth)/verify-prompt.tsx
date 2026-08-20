import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { HolographicBackground } from "@/components/ui/holographic-background";
import { useAuthStore } from "@/stores/auth-store";
import { CustomFonts, Palette } from "@/constants/theme";

/** Masks an email as first-letter + **** + last-letter + @domain. */
function maskEmail(email: string | null): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 2) return `${local[0] ?? ""}***@${domain}`;
  return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

/**
 * Shown on app launch when the user is logged in but hasn't verified their
 * email. No code is sent until the user taps "Send code" — which emails a
 * fresh code and moves on to the code-entry screen.
 */
export default function VerifyPromptScreen() {
  const router = useRouter();
  const { signOut, username, email } = useAuthStore();
  const maskedEmail = maskEmail(email);

  const handleLogout = async () => {
    await signOut();
    router.replace("/(auth)/sign-in" as any);
  };

  return (
    <View style={styles.root}>
      <HolographicBackground />

      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Ionicons
            name="mail-unread-outline"
            size={56}
            color={Palette.purple}
          />
        </View>

        <Text style={styles.title}>Verify your email</Text>

        {username || maskedEmail ? (
          <View style={styles.accountBox}>
            {username ? (
              <Text style={styles.accountName}>{username}</Text>
            ) : null}
            {maskedEmail ? (
              <Text style={styles.accountEmail}>{maskedEmail}</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.subtitle}>
          Your account isn&apos;t verified yet. We&apos;ll email you a 6-digit
          code to confirm it.
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={() =>
            router.replace("/(auth)/verify-email?next=tabs&send=true" as any)
          }
        >
          <Text style={styles.buttonText}>Send code</Text>
        </Pressable>

        <Text style={styles.notYou}>
          Not you?{" "}
          <Text style={styles.logoutLink} onPress={handleLogout}>
            Back to log in
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 14,
  },
  iconWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(207, 126, 242, 0.15)",
    borderWidth: 2,
    borderColor: "rgba(207, 126, 242, 0.3)",
    marginBottom: 8,
  },
  title: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 28,
    color: Palette.pink,
    textAlign: "center",
    lineHeight: 36,
    paddingTop: 4,
  },
  accountBox: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
    gap: 2,
  },
  accountName: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 18,
    color: Palette.white,
  },
  accountEmail: {
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: Palette.white,
    opacity: 0.9,
  },
  subtitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 14,
    color: Palette.white,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  button: {
    backgroundColor: Palette.purple,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 40,
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
  notYou: {
    fontFamily: CustomFonts.moyamoya,
    marginTop: 12,
    fontSize: 13,
    color: Palette.white,
    textAlign: "center",
  },
  logoutLink: {
    fontFamily: CustomFonts.moyamoya,
    color: Palette.pink,
    textDecorationLine: "underline",
  },
});
