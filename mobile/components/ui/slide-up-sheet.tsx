import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';

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
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    paddingTop: 8,
    alignItems: 'center',
  },
});
