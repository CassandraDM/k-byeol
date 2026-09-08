import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CustomFonts, Palette } from '@/constants/theme';

export interface ReactivationOffer {
  email: string;
  provider: string;
  gracePeriodDays: number;
}

interface Props {
  /** Null while there is nothing to offer, which is almost always. */
  offer: ReactivationOffer | null;
  busy: boolean;
  onReactivate: () => void;
  onKeepDeleted: () => void;
}

/**
 * Shown when a sign-in lands on an account its owner deleted, inside the
 * window where it can still be brought back.
 *
 * It says what comes back rather than just asking a question: nothing was
 * destroyed when the account was deleted, so the answer is "all of it", and
 * that is the one fact that makes the choice an easy one.
 */
export function ReactivateAccountDialog({
  offer,
  busy,
  onReactivate,
  onKeepDeleted,
}: Props) {
  const social = offer?.provider === 'google' || offer?.provider === 'apple';

  return (
    <Modal
      visible={offer !== null}
      transparent
      animationType="fade"
      onRequestClose={onKeepDeleted}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.body}>
            You deleted this account. It can still come back — your events, the
            people you follow and everything else are exactly where you left
            them.
          </Text>
          <Text style={styles.note}>
            {social
              ? 'Reactivating signs you straight back in.'
              : `We’ll email a code to ${offer?.email ?? 'your address'} to make sure it’s you.`}
          </Text>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.secondary,
                pressed && styles.pressed,
              ]}
              onPress={onKeepDeleted}
              disabled={busy}>
              <Text style={styles.secondaryText}>Leave it deleted</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.primary,
                (pressed || busy) && styles.pressed,
              ]}
              onPress={onReactivate}
              disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Reactivate</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(40, 20, 55, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    backgroundColor: '#F7F2FF',
    borderRadius: 20,
    padding: 22,
    gap: 12,
  },
  title: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 22,
    color: Palette.purple,
    lineHeight: 30,
  },
  body: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: '#5B3E6E',
    lineHeight: 20,
  },
  note: {
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: '#6B5478',
    lineHeight: 19,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondary: { backgroundColor: 'rgba(207, 126, 242, 0.12)' },
  secondaryText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.purple,
    textAlign: 'center',
  },
  primary: { backgroundColor: Palette.purple },
  primaryText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 16,
    color: '#fff',
    letterSpacing: 0.3,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
