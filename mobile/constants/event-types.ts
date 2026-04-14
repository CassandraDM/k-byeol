import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export type EventType = 'RANDOM_PLAY_DANCE' | 'FESTIVAL' | 'ON_STAGE' | 'IN_PUBLIC';

export interface EventTypeConfig {
  color: string;
  icon: IoniconsName;
  label: string;
}

export const EVENT_TYPE_CONFIG: Record<EventType, EventTypeConfig> = {
  RANDOM_PLAY_DANCE: { color: '#FF6B9D', icon: 'musical-notes', label: 'Random Play Dance' },
  FESTIVAL:          { color: '#FFB347', icon: 'star',           label: 'Festival' },
  ON_STAGE:          { color: '#87CEEB', icon: 'mic',            label: 'On Stage' },
  IN_PUBLIC:         { color: '#98D8C8', icon: 'people',         label: 'In Public' },
};
