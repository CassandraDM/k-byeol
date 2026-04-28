import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView from 'react-native-maps';

import { useAuthStore } from '@/stores/auth-store';
import { apiFetch } from '@/utils/api';
import { getCityCoordinates, DEFAULT_COORDINATES } from '@/utils/geo';
import { EventMarker } from '@/components/event-marker';
import type { MapEvent } from '@/components/event-marker';

const MAP_DELTA = { latitudeDelta: 0.08, longitudeDelta: 0.08 };
const ZOOM_DURATION = 400;

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

  // Fetch events helper
  const fetchEvents = useCallback(
    async (coords: { latitude: number; longitude: number }) => {
      if (!token) return;
      try {
        const res = await apiFetch(
          `/events?lat=${coords.latitude}&lng=${coords.longitude}&radius=50`,
        );
        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } catch (e) {
        console.error('[MapScreen] Failed to fetch events:', e);
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
        setCoordinates(coords);
        await fetchEvents(coords);
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

  // Refresh events when returning from detail page
  useFocusEffect(
    useCallback(() => {
      setSelectedEventId(null);
      if (coordinates) {
        fetchEvents(coordinates);
      }
    }, [coordinates, fetchEvents]),
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

  if (isLoading || !coordinates) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#B100FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...coordinates, ...MAP_DELTA }}
        mapPadding={{ top: 0, right: 0, bottom: 84, left: 0 }}>
        {events.map((event) => (
          <EventMarker
            key={event.id}
            event={event}
            isSelected={selectedEventId === event.id}
            isOwner={event.organizerId === currentUserId}
            onSelect={handleMarkerSelect}
          />
        ))}
      </MapView>
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
});
