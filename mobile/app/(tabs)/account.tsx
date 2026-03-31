import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export default function AccountScreen() {
  return (
    <View style={styles.container}>
      <ThemedText type="title">Account</ThemedText>
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
