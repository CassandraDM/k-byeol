import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { PageBackground } from '@/constants/theme';

interface SlideUpSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Modal bottom sheet where the backdrop fades in/out
 * and the content slides up/down from the bottom.
 */
export function SlideUpSheet({ visible, onClose, children }: SlideUpSheetProps) {
  const translateY = useRef(new Animated.Value(400)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      // Show modal, then slide up
      setMounted(true);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      // Slide down, then unmount
      Animated.timing(translateY, {
        toValue: 400,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, translateY]);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      {/* A Modal sits outside the screen's layout, so Android's adjustResize
          never reaches it — the sheet has to lift itself above the keyboard. */}
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}>
          {/* Same chrome as the filter sheet, so every sheet reads alike. */}
          <LinearGradient
            colors={PageBackground}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.grabber} />
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(207, 126, 242, 0.35)',
    marginBottom: 8,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: 24,
    paddingTop: 8,
    alignItems: 'center',
  },
});
