import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';

const ACTIVE_COLOR = '#B100FF';
const INACTIVE_COLOR = 'rgba(215, 61, 255, 0.45)';

type TabConfig =
  | {
      name: string;
      activeIcon: React.ComponentProps<typeof Ionicons>['name'];
      inactiveIcon: React.ComponentProps<typeof Ionicons>['name'];
      customImage?: never;
    }
  | {
      name: string;
      activeIcon: number;
      inactiveIcon: number;
      customImage: true;
    };

const TAB_CONFIG: TabConfig[] = [
  { name: 'index', activeIcon: 'map', inactiveIcon: 'map-outline' },
  {
    name: 'chat',
    customImage: true,
    activeIcon: require('@/assets/images/chat_focused.svg'),
    inactiveIcon: require('@/assets/images/chat_unfocused.svg'),
  },
  { name: 'new', activeIcon: 'add-circle', inactiveIcon: 'add-circle-outline' },
  { name: 'shop', activeIcon: 'cart', inactiveIcon: 'cart-outline' },
  { name: 'account', activeIcon: 'person-circle', inactiveIcon: 'person-circle-outline' },
];

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.wrapper}>
      <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.glassOverlay} />
      <View style={styles.glassHighlight} />
      <View style={styles.container}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const tabConfig = TAB_CONFIG[index];

          if (!tabConfig) return null;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              if (process.env.EXPO_OS === 'ios') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel}>
              {tabConfig.customImage ? (
                <Image
                  source={isFocused ? tabConfig.activeIcon : tabConfig.inactiveIcon}
                  style={styles.customIcon}
                  contentFit="contain"
                />
              ) : (
                <Ionicons
                  name={isFocused ? tabConfig.activeIcon : tabConfig.inactiveIcon}
                  size={30}
                  color={isFocused ? ACTIVE_COLOR : INACTIVE_COLOR}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderRadius: 10,
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(242, 237, 255, 0.55)',
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  container: {
    height: 84,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 23,
    gap: 40,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  customIcon: {
    width: 30,
    height: 30,
  },
});
