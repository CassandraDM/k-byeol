import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export default function ShopScreen() {
  return (
    <View style={styles.container}>
      <ThemedText type="title">Shop</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
