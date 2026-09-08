import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth-store';
import { exportMyData } from '@/utils/account';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuthStore();
  const [exporting, setExporting] = useState(false);

  const handleLogout = async () => {
    await signOut();
    router.replace('/(auth)/sign-in' as any);
  };

  const handleExport = async () => {
    setExporting(true);
    const result = await exportMyData();
    setExporting(false);
    if (result.status === 'error') {
      Alert.alert('Export failed', result.message);
    }
  };

  return (
    <LinearGradient colors={['#EDE7FF', '#F2EDFF']} style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconSlot}
            hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color={Palette.purple} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.iconSlot} />
        </View>

        {/* Account section */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push('/settings/edit-profile' as any)}>
            <Ionicons
              name="create-outline"
              size={20}
              color={Palette.purple}
            />
            <Text style={styles.rowText}>Edit profile</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Palette.purple}
            />
          </Pressable>
        </View>

        {/* Safety section */}
        <Text style={styles.sectionTitle}>Safety</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push('/settings/blocked' as any)}>
            <Ionicons name="ban-outline" size={20} color={Palette.purple} />
            <Text style={styles.rowText}>Blocked users</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Palette.purple}
            />
          </Pressable>

        </View>

        {/* Your data */}
        <Text style={styles.sectionTitle}>Your data</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={handleExport}
            disabled={exporting}>
            <Ionicons
              name="download-outline"
              size={20}
              color={Palette.purple}
            />
            <Text style={styles.rowText}>Export my data</Text>
            {exporting ? (
              <ActivityIndicator size="small" color={Palette.purple} />
            ) : (
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Palette.purple}
              />
            )}
          </Pressable>

          <View style={styles.rowDivider} />

          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push('/settings/delete-account' as any)}>
            <Ionicons name="trash-outline" size={20} color="#E74C3C" />
            <Text style={[styles.rowText, styles.dangerText]}>
              Delete my account
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#E74C3C" />
          </Pressable>
        </View>

        {/* Log out */}
        <View style={styles.logoutWrap}>
          <Pressable
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.pressed,
            ]}
            onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
            <Text style={styles.logoutText}>Log Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconSlot: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: CustomFonts.moyamoya,
    fontSize: 28,
    color: Palette.purple,
    lineHeight: 38,
    paddingTop: 4,
  },
  sectionTitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 16,
    color: Palette.purple,
    marginTop: 20,
    marginBottom: 8,
    lineHeight: 24,
    paddingTop: 2,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.2)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowText: {
    flex: 1,
    fontFamily: CustomFonts.moyamoya,
    fontSize: 15,
    color: Palette.purple,
  },
  rowDivider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: 'rgba(207, 126, 242, 0.2)',
  },
  dangerText: { color: '#E74C3C' },
  logoutWrap: {
    marginTop: 32,
    alignItems: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E74C3C',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 32,
    shadowColor: '#E74C3C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  logoutText: {
    fontFamily: CustomFonts.syongsyong,
    color: '#fff',
    fontSize: 18,
    letterSpacing: 0.3,
  },
});
