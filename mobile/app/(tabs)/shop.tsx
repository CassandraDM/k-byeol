import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';

const FUN_MESSAGES = [
  // Stray Kids
  "Bang Chan is project-managing the launch 📋",
  "Felix is baking cookies for the staff 🍪",
  "Hyunjin is sketching the perfect storefront 🎨",
  "Han is freestyling the shop's jingle 🎤",
  "Lee Know is teaching the cats to shelve photocards 🐱",
  "Changbin is bench-pressing the boxes 💪",
  "Seungmin is sorting albums in alphabetical order 📚",
  "I.N is doing one last QA pass 🔍",

  // ITZY
  "Yeji says: \"focus, the shop is coming\" 🎯",
  "Ryujin is restocking the rookie corner 🔥",
  "Chaeryeong choreographed the unboxing dance 💃",
  "Lia is testing the checkout sound on piano 🎹",
  "Yuna is folding hoodies with extreme care 🧸",

  // TWICE
  "Nayeon is approving every product photo 📸",
  "Sana is writing \"shy shy shy\" on the gift cards 🎁",
  "Momo is choreographing the delivery dance 📦",
  "Jihyo is leading the meeting (again) 👑",
  "Dahyun is hyping up the server like \"eagle\" 🦅",
  "Chaeyoung is hand-drawing the loyalty stamps ✏️",
  "Tzuyu is keeping the shelves ✨ aesthetic ✨",
  "Jeongyeon is fixing every typo in the catalog 📝",
  "Mina is double-checking the inventory 🦢",

  // NMIXX
  "Lily is rehearsing the welcome high note 🎶",
  "Haewon is testing the discount code dispenser 🎟️",
  "Sullyoon is unboxing the test merch 📦",
  "Bae is adding extra sparkle to everything ✨",
  "Jiwoo is keeping morale at 200% 🔥",
  "Kyujin is the youngest but supervises everyone 👀",

  // ATEEZ
  "Hongjoong is redesigning the layout (again) 🏴‍☠️",
  "Seonghwa is dusting every shelf at 5am 🧹",
  "Yunho is carrying ALL the boxes in one trip 📦",
  "San tried the merch and approved it 💯",
  "Wooyoung is pranking the QA team 😈",
  "Mingi is making the speakers louder 🔊",
  "Jongho is splitting open the box of new stock 🍎",
  "Yeosang is keeping it elegant and on schedule ✨",
];

export default function ShopScreen() {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      // fade out → swap message → fade in
      Animated.timing(fade, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        setIndex((i) => (i + 1) % FUN_MESSAGES.length);
        Animated.timing(fade, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }).start();
      });
    }, 7000);

    return () => clearInterval(interval);
  }, [fade]);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="construct-outline" size={64} color={Palette.purple} />
      </View>
      <Text style={styles.title}>Shop is under construction</Text>
      <Text style={styles.subtitle}>
        We&apos;re building the K-pop marketplace right now. Stay tuned!
      </Text>
      <Animated.Text style={[styles.funText, { opacity: fade }]}>
        {FUN_MESSAGES[index]}
      </Animated.Text>
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
  funText: {
    marginTop: 24,
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: Palette.purple,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 10,
    minHeight: 40,
  },
});
