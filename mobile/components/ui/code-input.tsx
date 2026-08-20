import { useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { CustomFonts, Palette } from "@/constants/theme";

const LENGTH = 6;

interface CodeInputProps {
  value: string;
  onChangeText: (value: string) => void;
  error?: boolean;
  autoFocus?: boolean;
}

/**
 * 6-cell numeric code field (OTP-style) used by the email-verification and
 * password-reset flows.
 *
 * Each digit is rendered in its own box, so there is no letter-spacing on any
 * input — which also sidesteps the Fabric view-recycling quirk entirely.
 */
export function CodeInput({
  value,
  onChangeText,
  error,
  autoFocus,
}: CodeInputProps) {
  const inputRef = useRef<TextInput>(null);
  const cells = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  return (
    <Pressable style={styles.row} onPress={() => inputRef.current?.focus()}>
      {cells.map((digit, i) => {
        const isActive = i === value.length; // next cell to fill
        return (
          <View
            key={i}
            style={[
              styles.cell,
              isActive && styles.cellActive,
              error ? styles.cellError : null,
            ]}
          >
            <Text style={styles.cellText}>{digit}</Text>
          </View>
        );
      })}

      {/* Invisible field that actually captures the keystrokes. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(v) =>
          onChangeText(v.replace(/[^0-9]/g, "").slice(0, LENGTH))
        }
        keyboardType="number-pad"
        maxLength={LENGTH}
        autoFocus={autoFocus}
        caretHidden
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  cell: {
    flex: 1,
    height: 54,
    borderRadius: 10,
    backgroundColor: Palette.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  cellActive: {
    borderColor: Palette.purple,
  },
  cellError: {
    borderColor: "#C10050",
  },
  cellText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 24,
    color: "#E07EFF",
  },
  hiddenInput: {
    position: "absolute",
    width: "100%",
    height: "100%",
    opacity: 0,
  },
});
