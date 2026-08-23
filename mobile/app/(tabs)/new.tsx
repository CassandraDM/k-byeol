import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { DateTimeField } from '@/components/ui/date-time-field';
import { CustomFonts, Palette } from '@/constants/theme';
import { apiFetch } from '@/utils/api';
import { useAuthStore } from '@/stores/auth-store';
import { EVENT_TYPE_CONFIG } from '@/constants/event-types';
import type { EventType } from '@/constants/event-types';

interface AddressSuggestion {
  label: string;
  latitude: number;
  longitude: number;
}

async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  if (query.length < 3) return [];
  const res = await fetch(
    `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.features.map((f: any) => ({
    label: f.properties.label,
    latitude: f.geometry.coordinates[1],
    longitude: f.geometry.coordinates[0],
  }));
}

const TYPE_OPTIONS: EventType[] = [
  'RANDOM_PLAY_DANCE',
  'FESTIVAL',
  'ON_STAGE',
  'IN_PUBLIC',
];

export default function NewEventScreen() {
  const router = useRouter();
  const { token, emailVerified } = useAuthStore();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType | null>(null);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [address, setAddress] = useState<AddressSuggestion | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAddressChange = async (text: string) => {
    setAddressQuery(text);
    setAddress(null);
    setAddressSuggestions(await searchAddresses(text));
  };

  const validate = (): string | null => {
    if (!title.trim()) return 'Title is required';
    if (!type) return 'Event type is required';
    if (!date) return 'Date is required';
    if (!time) return 'Time is required';
    if (!address) return 'Please select a location from suggestions';
    if (!description.trim()) return 'Description is required';
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      Alert.alert('Missing info', error);
      return;
    }
    if (!token) return;
    setSubmitting(true);

    try {
      const dateStr = date!.toISOString().split('T')[0];
      const timeStr = `${String(time!.getHours()).padStart(2, '0')}:${String(time!.getMinutes()).padStart(2, '0')}`;

      const res = await apiFetch('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          type,
          latitude: address!.latitude,
          longitude: address!.longitude,
          address: address!.label,
          date: dateStr,
          time: timeStr,
          description: description.trim(),
        }),
      });

      if (res.ok) {
        // Reset form
        setTitle('');
        setType(null);
        setDate(null);
        setTime(null);
        setAddressQuery('');
        setAddress(null);
        setDescription('');
        // Go to map tab (navigate triggers useFocusEffect to refetch events)
        router.navigate('/(tabs)/' as any);
      } else {
        const body = await res.json().catch(() => ({}));
        Alert.alert('Error', body.message?.toString() ?? 'Failed to create event');
      }
    } catch (e) {
      console.error('[NewEvent] Submit error:', e);
      Alert.alert('Error', 'Could not create event. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Gate: event creation requires a verified email (enforced server-side too).
  if (!emailVerified) {
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Palette.purple} />
          </Pressable>
          <Text style={styles.headerTitle}>New Event</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.gate}>
          <View style={styles.gateIcon}>
            <Ionicons name="mail-unread-outline" size={56} color={Palette.purple} />
          </View>
          <Text style={styles.gateTitle}>Verify your email first</Text>
          <Text style={styles.gateText}>
            You need to verify your email address before you can create events.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.gateButton,
              pressed && styles.submitPressed,
            ]}
            onPress={() =>
              router.push("/(auth)/verify-email?send=true" as any)
            }>
            <Text style={styles.submitText}>Verify email</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Fixed header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Palette.purple} />
        </Pressable>
        <Text style={styles.headerTitle}>New Event</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* Form card */}
        <View style={styles.formCard}>
          {/* Gradient background layers (Figma: radial purple→cyan + translucent overlays) */}
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(215, 61, 255, 0.20)',
              'rgba(181, 59, 254, 0.20)',
              'rgba(154, 239, 255, 0.20)',
            ]}
            locations={[0.15, 0.35, 0.7]}
            start={{ x: -0.3, y: 0 }}
            end={{ x: 1.2, y: 1 }}
            style={styles.gradientLayer}
          />
          <View pointerEvents="none" style={styles.tintDark} />
          <View pointerEvents="none" style={styles.tintLight} />

          {/* Title */}
          <View style={styles.field}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="My awesome event"
              placeholderTextColor="rgba(207, 126, 242, 0.4)"
              maxLength={255}
            />
          </View>

          {/* Type dropdown */}
          <View style={styles.field}>
            <Text style={styles.label}>Type</Text>
            <Pressable
              style={styles.input}
              onPress={() => setTypeMenuOpen((v) => !v)}>
              <View style={styles.dropdownRow}>
                <Text style={[styles.inputText, !type && styles.placeholderText]}>
                  {type ? EVENT_TYPE_CONFIG[type].label : 'Select a type'}
                </Text>
                <Ionicons
                  name={typeMenuOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Palette.purple}
                />
              </View>
            </Pressable>
            {typeMenuOpen && (
              <View style={styles.dropdownMenu}>
                {TYPE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt}
                    style={({ pressed }) => [
                      styles.dropdownItem,
                      pressed && { backgroundColor: 'rgba(207, 126, 242, 0.1)' },
                    ]}
                    onPress={() => {
                      setType(opt);
                      setTypeMenuOpen(false);
                    }}>
                    <View
                      style={[
                        styles.dropdownDot,
                        { backgroundColor: EVENT_TYPE_CONFIG[opt].color },
                      ]}
                    />
                    <Text style={styles.dropdownItemText}>
                      {EVENT_TYPE_CONFIG[opt].label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Date & Time */}
          <View style={styles.row}>
            <View style={styles.flexHalf}>
              <DateTimeField
                mode="date"
                label="Date"
                value={date}
                onChange={setDate}
                minimumDate={new Date()}
              />
            </View>
            <View style={styles.flexHalf}>
              <DateTimeField
                mode="time"
                label="Time"
                value={time}
                onChange={setTime}
              />
            </View>
          </View>

          {/* Location */}
          <View style={styles.field}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              style={styles.input}
              value={address ? address.label : addressQuery}
              onChangeText={handleAddressChange}
              placeholder="Search address..."
              placeholderTextColor="rgba(207, 126, 242, 0.4)"
            />
            {addressSuggestions.length > 0 && !address && (
              <View style={styles.dropdownMenu}>
                {addressSuggestions.map((s, i) => (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [
                      styles.dropdownItem,
                      pressed && { backgroundColor: 'rgba(207, 126, 242, 0.1)' },
                    ]}
                    onPress={() => {
                      setAddress(s);
                      setAddressQuery(s.label);
                      setAddressSuggestions([]);
                    }}>
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color={Palette.purple}
                    />
                    <Text style={styles.dropdownItemText} numberOfLines={1}>
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Tell people what to expect..."
              placeholderTextColor="rgba(207, 126, 242, 0.4)"
              multiline
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Submit */}
        <View style={styles.submitRow}>
          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              pressed && styles.submitPressed,
              submitting && { opacity: 0.7 },
            ]}
            onPress={handleSubmit}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Create</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 14,
    marginTop: -40,
  },
  gateIcon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(207, 126, 242, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(207, 126, 242, 0.3)',
    marginBottom: 8,
  },
  gateTitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 24,
    color: Palette.purple,
    textAlign: 'center',
    lineHeight: 32,
    paddingTop: 4,
  },
  gateText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.pink,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  gateButton: {
    backgroundColor: '#CF7EF2',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 120,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 32,
    color: Palette.purple,
    lineHeight: 42,
    paddingTop: 4,
  },
  formCard: {
    width: 357,
    maxWidth: '100%',
    alignSelf: 'center',
    paddingTop: 30,
    paddingRight: 20,
    paddingBottom: 40,
    paddingLeft: 20,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 20,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.2)',
  },
  gradientLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  tintDark: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(43, 43, 43, 0.10)',
  },
  tintLight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(242, 237, 255, 0.35)',
  },
  field: {
    alignSelf: 'stretch',
    gap: 6,
  },
  label: {
    alignSelf: 'flex-start',
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: '#E7FCFE',
  },
  input: {
    alignSelf: 'stretch',
    backgroundColor: '#E7FCFE',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.input,
    minHeight: 46,
    justifyContent: 'center',
    letterSpacing: 0,
  },
  inputText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.input,
  },
  placeholderText: {
    color: 'rgba(207, 126, 242, 0.5)',
  },
  textarea: {
    minHeight: 100,
    paddingTop: 12,
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownMenu: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.25)',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dropdownItemText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.input,
    flex: 1,
  },
  row: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 12,
  },
  flexHalf: {
    flex: 1,
  },
  submitRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  submitButton: {
    backgroundColor: '#CF7EF2',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  submitText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 20,
    color: '#fff',
    letterSpacing: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    paddingTop: 8,
    alignItems: 'center',
  },
  picker: {
    width: '100%',
    height: 220,
  },
  modalDone: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
    backgroundColor: '#CF7EF2',
    borderRadius: 12,
  },
  modalDoneText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 20,
    color: '#fff',
  },
});
