import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

/**
 * Full-screen background using the app's official background asset.
 */
export function HolographicBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={require('@/assets/images/background.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
    </View>
  );
}
