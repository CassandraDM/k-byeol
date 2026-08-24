import { StyleSheet, Text, View } from "react-native";

import { CustomFonts, Palette } from "@/constants/theme";
import type { DateTimeFieldProps } from "./date-time-field";

// Raw DOM <input> — react-native-web renders to the browser, where
// type="date"/"time" give native pickers. Cast avoids needing the DOM lib.
const Input: any = "input";

const pad = (n: number) => String(n).padStart(2, "0");

function toInputValue(mode: "date" | "time", value: Date | null): string {
  if (!value) return "";
  return mode === "date"
    ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
    : `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** Date/time field — web implementation using native browser inputs. */
export function DateTimeField({
  mode,
  label,
  value,
  onChange,
  minimumDate,
  labelColor,
  required,
}: DateTimeFieldProps) {
  const handleChange = (e: { target: { value: string } }) => {
    const v = e.target.value;
    if (!v) return;
    if (mode === "date") {
      const [y, m, d] = v.split("-").map(Number);
      onChange(new Date(y, m - 1, d));
    } else {
      const [h, min] = v.split(":").map(Number);
      const next = new Date(value ?? new Date());
      next.setHours(h, min, 0, 0);
      onChange(next);
    }
  };

  return (
    <View style={styles.field}>
      <Text style={[styles.label, labelColor ? { color: labelColor } : null]}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <Input
        type={mode}
        value={toInputValue(mode, value)}
        min={
          mode === "date" && minimumDate
            ? toInputValue("date", minimumDate)
            : undefined
        }
        onChange={handleChange}
        style={{
          backgroundColor: "#E7FCFE",
          borderRadius: 10,
          padding: "12px 14px",
          minHeight: 46,
          border: "none",
          outline: "none",
          fontSize: 14,
          color: Palette.input,
          fontFamily: "inherit",
          width: "100%",
          boxSizing: "border-box",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { alignSelf: "stretch", gap: 6 },
  label: {
    alignSelf: "flex-start",
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: "#E7FCFE",
  },
  required: { color: Palette.pink },
});
