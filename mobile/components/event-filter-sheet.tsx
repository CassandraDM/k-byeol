import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { DateTimeField } from '@/components/ui/date-time-field';
import { CustomFonts, PageBackground, Palette } from '@/constants/theme';

/** Everything the map screen can narrow events down by. */
export interface EventFilters {
  /** Keyword typed in the search bar (lives here so "reset" clears it too). */
  q: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  radiusKm: number;
}

export const DEFAULT_RADIUS_KM = 50;

export const DEFAULT_FILTERS: EventFilters = {
  q: '',
  dateFrom: null,
  dateTo: null,
  radiusKm: DEFAULT_RADIUS_KM,
};

const RADIUS_OPTIONS = [1, 5, 10, 25, 50, 100];

/** Matches the floating tab bar in components/ui/tab-bar.tsx. */
const TAB_BAR_HEIGHT = 84;

/**
 * DateTimeField defaults to a near-white label for the dark create-event
 * screen; on this pale sheet it needs the brand purple instead.
 */
const DATE_LABEL_COLOR = Palette.purple;

/**
 * How many of *this sheet's* filters differ from the defaults — drives the
 * badge on the filter button.
 *
 * The keyword is deliberately excluded: it's already visible in the search
 * bar, so counting it would flag the button for something that isn't hidden
 * behind it. Use `isNarrowed` when you need "is anything filtering at all".
 */
export function countActiveFilters(filters: EventFilters): number {
  let count = 0;
  if (filters.dateFrom) count += 1;
  if (filters.dateTo) count += 1;
  if (filters.radiusKm !== DEFAULT_RADIUS_KM) count += 1;
  return count;
}

/** True when anything at all is narrowing the results, keyword included. */
export function isNarrowed(filters: EventFilters): boolean {
  return countActiveFilters(filters) > 0 || filters.q.trim().length > 0;
}

/** YYYY-MM-DD in the user's own timezone (toISOString would shift the day). */
function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Serialises filters into the query string `GET /events` expects. */
export function buildEventsQuery(
  coords: { latitude: number; longitude: number },
  filters: EventFilters,
): string {
  const params = new URLSearchParams({
    lat: String(coords.latitude),
    lng: String(coords.longitude),
    radiusKm: String(filters.radiusKm),
  });

  const keyword = filters.q.trim();
  if (keyword) params.set('q', keyword);
  if (filters.dateFrom) params.set('dateFrom', toIsoDate(filters.dateFrom));
  if (filters.dateTo) params.set('dateTo', toIsoDate(filters.dateTo));

  return params.toString();
}

interface EventFilterSheetProps {
  visible: boolean;
  filters: EventFilters;
  onClose: () => void;
  onApply: (filters: EventFilters) => void;
}

/**
 * Bottom sheet for date range + distance.
 *
 * Deliberately not a Modal: `DateTimeField` opens its own modal sheet, and
 * stacking modals is unreliable on iOS. An absolutely-positioned overlay lets
 * the date picker sit cleanly on top.
 */
export function EventFilterSheet({
  visible,
  filters,
  onClose,
  onApply,
}: EventFilterSheetProps) {
  const translateY = useRef(new Animated.Value(600)).current;
  const [mounted, setMounted] = useState(visible);
  // Edited locally so closing without applying discards the changes.
  const [draft, setDraft] = useState<EventFilters>(filters);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(translateY, {
        toValue: 600,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, translateY]);

  if (!mounted) return null;

  // Keep the keyword — it belongs to the search bar, not this sheet.
  const handleReset = () => setDraft({ ...DEFAULT_FILTERS, q: draft.q });

  const invalidRange =
    draft.dateFrom !== null &&
    draft.dateTo !== null &&
    draft.dateTo < draft.dateFrom;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        {/* Same page background as the rest of the app. */}
        <LinearGradient
          colors={PageBackground}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.grabber} />

        {/* Actions live in the header: a footer would sit under the tab bar,
            which floats above this sheet and swallowed the old buttons. */}
        <View style={styles.header}>
          <Text style={styles.title}>Filters</Text>

          <View style={styles.headerActions}>
            <Pressable onPress={handleReset} hitSlop={10}>
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            <Pressable onPress={() => onApply(draft)} hitSlop={10}>
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>Date range</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateCell}>
              <DateTimeField
                mode="date"
                label="From"
                labelColor={DATE_LABEL_COLOR}
                value={draft.dateFrom}
                onChange={(dateFrom) => setDraft((d) => ({ ...d, dateFrom }))}
              />
            </View>
            <View style={styles.dateCell}>
              <DateTimeField
                mode="date"
                label="To"
                labelColor={DATE_LABEL_COLOR}
                value={draft.dateTo}
                onChange={(dateTo) => setDraft((d) => ({ ...d, dateTo }))}
                minimumDate={draft.dateFrom ?? undefined}
              />
            </View>
          </View>

          {invalidRange && (
            <Text style={styles.hint}>
              The end date is before the start date — nothing can match.
            </Text>
          )}

          <Text style={styles.sectionLabel}>Distance</Text>
          <View style={styles.chipRow}>
            {RADIUS_OPTIONS.map((km) => {
              const selected = draft.radiusKm === km;
              return (
                <Pressable
                  key={km}
                  onPress={() => setDraft((d) => ({ ...d, radiusKm: km }))}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.chipPressed,
                  ]}>
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}>
                    {km} km
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Keeps the gradient behind the content clipped to the rounded corners.
    overflow: 'hidden',
    paddingTop: 8,
    // Clears the floating tab bar, which sits above this sheet.
    paddingBottom: TAB_BAR_HEIGHT + 16,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(207, 126, 242, 0.35)',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  title: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 26,
    color: Palette.purple,
    lineHeight: 34,
    paddingTop: 4,
  },
  body: {
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingBottom: 12,
  },
  sectionLabel: {
    // Same face as the "From" / "To" field labels, two points up so the
    // section still reads as a heading above them.
    fontFamily: CustomFonts.moyamoya,
    fontSize: 15,
    color: Palette.purple,
    marginTop: 14,
    marginBottom: 6,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateCell: {
    flex: 1,
  },
  hint: {
    fontFamily: CustomFonts.outfit,
    fontSize: 12,
    color: '#C2410C',
    marginTop: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(207, 126, 242, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.25)',
  },
  chipSelected: {
    backgroundColor: Palette.purple,
    borderColor: Palette.purple,
  },
  chipPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  chipText: {
    fontFamily: CustomFonts.outfitMedium,
    fontSize: 13,
    color: Palette.purple,
  },
  chipTextSelected: {
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  resetText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 17,
    color: 'rgba(207, 126, 242, 0.7)',
  },
  applyText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 18,
    color: Palette.purple,
  },
});
