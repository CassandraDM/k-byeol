import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MapView from '@/components/ui/map';

import { useAuthStore } from '@/stores/auth-store';
import { apiFetch } from '@/utils/api';
import { getCityCoordinates, DEFAULT_COORDINATES } from '@/utils/geo';
import { EventMarker } from '@/components/event-marker';
import type { MapEvent } from '@/components/event-marker';
import { EventList } from '@/components/event-list';
import {
  buildEventsQuery,
  countActiveFilters,
  DEFAULT_FILTERS,
  EventFilterSheet,
  isNarrowed,
  type EventFilters,
} from '@/components/event-filter-sheet';
import { CustomFonts, PageBackground, Palette } from '@/constants/theme';

const MAP_DELTA = { latitudeDelta: 0.08, longitudeDelta: 0.08 };
const ZOOM_DURATION = 400;
/** Wait for a pause in typing before hitting the API. */
const SEARCH_DEBOUNCE_MS = 350;

type ViewMode = 'map' | 'list';

export default function IndexScreen() {
  const { token } = useAuthStore();
  const mapRef = useRef<MapView>(null);

  // Current user id from JWT (used to mark events we organize)
  const currentUserId = (() => {
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split('.')[1])).sub as number;
    } catch {
      return null;
    }
  })();

  const [coordinates, setCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Search & filters ──────────────────────────────────────────────────────
  // `searchText` is what's in the box; `filters.q` is what we've actually
  // queried with. Keeping them apart is what makes debouncing possible.
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState<EventFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeFilterCount = countActiveFilters(filters);

  // Fetch events helper
  const fetchEvents = useCallback(
    async (
      coords: { latitude: number; longitude: number },
      activeFilters: EventFilters,
    ) => {
      if (!token) return;
      try {
        setIsRefreshing(true);
        const res = await apiFetch(
          `/events?${buildEventsQuery(coords, activeFilters)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as MapEvent[];
          setEvents(data);
        }
      } catch (e) {
        console.error('[MapScreen] Failed to fetch events:', e);
      } finally {
        setIsRefreshing(false);
      }
    },
    [token],
  );

  // Initial load: resolve city coordinates + fetch events
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function load() {
      try {
        const prefsRes = await apiFetch('/users/me/preferences');

        let coords = DEFAULT_COORDINATES;

        if (prefsRes.ok) {
          const prefs = await prefsRes.json();
          if (prefs.city?.code) {
            coords = await getCityCoordinates(prefs.city.code);
          }
        }

        if (cancelled) return;
        // Fetching is owned by the effect below, which reacts to `coordinates`.
        setCoordinates(coords);
      } catch (e) {
        console.error('[MapScreen] Failed to load:', e);
        if (!cancelled) setCoordinates(DEFAULT_COORDINATES);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token, fetchEvents]);

  // Debounce the search box into the committed filters.
  useEffect(() => {
    if (searchText === filters.q) return;
    const timer = setTimeout(
      () => setFilters((f) => ({ ...f, q: searchText })),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchText, filters.q]);

  // Single owner of "when do we hit the API": coordinates resolving, or the
  // committed filters changing.
  useEffect(() => {
    if (!coordinates) return;
    fetchEvents(coordinates, filters);
  }, [coordinates, filters, fetchEvents]);

  // Read through refs on focus so we never re-query with a stale snapshot —
  // depending on them directly would re-run this on every filter change and
  // fire a second, redundant request.
  const coordinatesRef = useRef(coordinates);
  coordinatesRef.current = coordinates;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Refresh events when returning from the detail page. Skipped on the very
  // first focus, which the effect above already covers.
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      setSelectedEventId(null);
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      if (coordinatesRef.current) {
        fetchEvents(coordinatesRef.current, filtersRef.current);
      }
    }, [fetchEvents]),
  );

  const handleMarkerSelect = useCallback((event: MapEvent) => {
    setSelectedEventId(null);

    mapRef.current?.animateToRegion(
      {
        latitude: event.latitude,
        longitude: event.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      ZOOM_DURATION,
    );

    setTimeout(() => {
      setSelectedEventId(event.id);
    }, ZOOM_DURATION + 100);
  }, []);

  const handleApplyFilters = useCallback((next: EventFilters) => {
    setFilters(next);
    setSearchText(next.q);
    setFiltersOpen(false);
  }, []);

  const handleClearAll = useCallback(() => {
    setSearchText('');
    setFilters(DEFAULT_FILTERS);
    Keyboard.dismiss();
  }, []);

  const markers = useMemo(
    () =>
      events.map((event) => (
        <EventMarker
          key={event.id}
          event={event}
          isSelected={selectedEventId === event.id}
          isOwner={event.organizerId === currentUserId}
          onSelect={handleMarkerSelect}
        />
      )),
    [events, selectedEventId, currentUserId, handleMarkerSelect],
  );

  if (isLoading || !coordinates) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#B100FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {viewMode === 'map' ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...coordinates, ...MAP_DELTA }}
          mapPadding={{ top: 0, right: 0, bottom: 84, left: 0 }}>
          {markers}
        </MapView>
      ) : (
        <LinearGradient colors={PageBackground} style={styles.listBackdrop}>
          <View style={styles.listSpacer} />
          <EventList
            events={events}
            hasActiveFilters={isNarrowed(filters)}
            onClearFilters={handleClearAll}
          />
        </LinearGradient>
      )}

      {/* Floating controls */}
      <View style={styles.controls} pointerEvents="box-none">
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Palette.purple} />
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search events..."
              placeholderTextColor="rgba(207, 126, 242, 0.5)"
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText('')} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color="rgba(207, 126, 242, 0.7)"
                />
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => setFiltersOpen(true)}
            style={({ pressed }) => [
              styles.filterButton,
              pressed && styles.pressed,
            ]}>
            <Ionicons name="options-outline" size={22} color="#fff" />
            {activeFilterCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggle}>
            {(['map', 'list'] as ViewMode[]).map((mode) => {
              const active = viewMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setViewMode(mode)}
                  style={[styles.toggleItem, active && styles.toggleItemActive]}>
                  <Ionicons
                    name={mode === 'map' ? 'map-outline' : 'list-outline'}
                    size={15}
                    color={active ? '#fff' : Palette.purple}
                  />
                  <Text
                    style={[
                      styles.toggleText,
                      active && styles.toggleTextActive,
                    ]}>
                    {mode === 'map' ? 'Map' : 'List'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.countPill}>
            {isRefreshing ? (
              <ActivityIndicator size="small" color={Palette.purple} />
            ) : (
              <Text style={styles.countText}>
                {events.length} {events.length === 1 ? 'event' : 'events'}
              </Text>
            )}
          </View>
        </View>
      </View>

      <EventFilterSheet
        visible={filtersOpen}
        filters={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={handleApplyFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  listBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  /** Clears the floating controls so the first card isn't hidden under them. */
  listSpacer: {
    height: 150,
  },
  controls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 58,
    paddingHorizontal: 16,
    gap: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    // Same ink as every other input in the app (new event, edit profile…).
    color: Palette.input,
    paddingVertical: 0,
  },
  filterButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.purple,
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#FF6B9D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    fontFamily: CustomFonts.outfitSemiBold,
    fontSize: 10,
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggle: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 17,
  },
  toggleItemActive: {
    backgroundColor: Palette.purple,
  },
  toggleText: {
    fontFamily: CustomFonts.outfitMedium,
    fontSize: 13,
    color: Palette.purple,
  },
  toggleTextActive: {
    color: '#fff',
  },
  countPill: {
    minWidth: 74,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  countText: {
    fontFamily: CustomFonts.outfitMedium,
    fontSize: 12,
    color: Palette.purple,
  },
});
