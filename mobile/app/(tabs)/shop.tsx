import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';

export default function ShopScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="construct-outline" size={64} color={Palette.purple} />
      </View>
      <Text style={styles.title}>Shop is under construction</Text>
      <Text style={styles.subtitle}>
        We're building the K-pop marketplace right now. Stay tuned!
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 40,
    gap: 14,
  },
  iconWrap: {
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
  title: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 24,
    color: Palette.purple,
    textAlign: 'center',
    lineHeight: 32,
    paddingTop: 4,
  },
  subtitle: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.pink,
    textAlign: 'center',
    lineHeight: 20,
  },
});
