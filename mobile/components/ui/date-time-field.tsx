import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";

import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { CustomFonts, Palette } from "@/constants/theme";

export interface DateTimeFieldProps {
  mode: "date" | "time";
  label: string;
  value: Date | null;
  onChange: (value: Date) => void;
  minimumDate?: Date;
  /**
   * Overrides the label colour. The default is near-white, which reads on the
   * dark create-event screen but vanishes on a white sheet.
   */
  labelColor?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

function formatValue(mode: "date" | "time", value: Date | null): string | null {
  if (!value) return null;
  return mode === "date"
    ? value.toLocaleDateString("en-GB")
    : `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/**
 * Date/time field — native implementation (iOS sheet, Android dialog).
 * The web build uses date-time-field.web.tsx instead.
 */
export function DateTimeField({
  mode,
  label,
  value,
  onChange,
  minimumDate,
  labelColor,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const display = formatValue(mode, value);
  const icon = mode === "date" ? "calendar-outline" : "time-outline";
  const placeholder = mode === "date" ? "Pick a date" : "Pick a time";

  return (
    <View style={styles.field}>
      <Text style={[styles.label, labelColor ? { color: labelColor } : null]}>
        {label}
      </Text>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <View style={styles.row}>
          <Text style={[styles.inputText, !value && styles.placeholder]}>
            {display ?? placeholder}
          </Text>
          <Ionicons name={icon} size={18} color={Palette.purple} />
        </View>
      </Pressable>

      {Platform.OS === "ios" ? (
        <SlideUpSheet visible={open} onClose={() => setOpen(false)}>
          <DateTimePicker
            value={value ?? new Date()}
            mode={mode}
            display="spinner"
            minimumDate={minimumDate}
            textColor="#333"
            themeVariant="light"
            style={styles.picker}
            onChange={(_, d) => {
              if (d) onChange(d);
            }}
          />
          <Pressable
            style={styles.done}
            onPress={() => {
              if (!value) onChange(new Date());
              setOpen(false);
            }}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </SlideUpSheet>
      ) : open ? (
        <DateTimePicker
          value={value ?? new Date()}
          mode={mode}
          minimumDate={minimumDate}
          onChange={(_, d) => {
            setOpen(false);
            if (d) onChange(d);
          }}
        />
      ) : null}
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
  input: {
    alignSelf: "stretch",
    backgroundColor: "#E7FCFE",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.input,
  },
  placeholder: { color: "rgba(207, 126, 242, 0.5)" },
  picker: { width: "100%", height: 220 },
  done: {
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
    backgroundColor: "#CF7EF2",
    borderRadius: 12,
  },
  doneText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 20,
    color: "#fff",
  },
});
