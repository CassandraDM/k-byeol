import { Redirect } from "expo-router";

// Sign-up is now handled inline in sign-in via a card expand animation
export default function SignUpRedirect() {
  return <Redirect href={"/(auth)/sign-in" as any} />;
}
