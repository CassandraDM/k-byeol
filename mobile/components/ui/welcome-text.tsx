import { useEffect, useRef, useState } from "react";
import { Animated, StyleProp, StyleSheet, TextStyle, View } from "react-native";

const welcomeTranslations = {
  ko: "안녕하세요!",
  en: "Welcome!",
  fr: "Bienvenue !",  // espace insécable avant ! (règle typographique française)
  de: "Willkommen!",
  es: "¡Bienvenido!",  // espagnol : ¡ inversé en début, pas d'espace

  //-- Note: Won't be used for now --//
  // it: "Benvenuto",
  // nl: "Welkom",
  // pt: "Bem-vindo",
  // sv: "Välkommen",
  // no: "Velkommen",// also works in Danish
  // fi: "Tervetuloa",
  // tr: "Hoş geldiniz",
  // id: "Selamat Datang",
  // pl: "Witam",
  // af: "Welkom",
  // ga: "Fáilte",

  //-- Note: These aren't supported by the font ! --//
  // ja: 'ようこそ',
  // zh: '歡迎',
  // ru: 'Добро пожаловать',
  // ar: 'أهلاً وسهلاً',
  // he: 'ברוך הבא',
  // el: 'Καλώς Ορίσατε',
  // hi: 'स्वागत',
  // fa: 'خوش آمدید',
  // th: "ยินดีต้อนรับ",

  //-- Note: These are supported by the font but are too long to fit in the design --//
  // ms: 'Selamat Datang',
  // tl: 'Maligayang Pagdating',
};

const WORDS = Object.values(welcomeTranslations);
const DISPLAY_MS = 2800;
const PUSH_MS = 600;
const SLIDE_DISTANCE = 28;

interface WelcomeTextProps {
  style?: StyleProp<TextStyle>;
}

export function WelcomeText({ style }: WelcomeTextProps) {
  const indexRef = useRef(0);
  const [currentWord, setCurrentWord] = useState(WORDS[0]);
  const [nextWord, setNextWord] = useState(WORDS[1]);

  // Current word: starts visible at rest position
  const currentOpacity = useRef(new Animated.Value(1)).current;
  const currentY = useRef(new Animated.Value(0)).current;

  // Next word: starts invisible below
  const nextOpacity = useRef(new Animated.Value(0)).current;
  const nextY = useRef(new Animated.Value(SLIDE_DISTANCE)).current;

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const cycle = () => {
      const nextIndex = (indexRef.current + 1) % WORDS.length;
      const incoming = WORDS[nextIndex];

      // Prepare incoming word below, invisible
      setNextWord(incoming);
      nextY.setValue(SLIDE_DISTANCE);
      nextOpacity.setValue(0);

      // Push: current slides up & fades out, next slides up into place
      Animated.parallel([
        Animated.timing(currentOpacity, { toValue: 0, duration: PUSH_MS, useNativeDriver: true }),
        Animated.timing(currentY, { toValue: -SLIDE_DISTANCE, duration: PUSH_MS, useNativeDriver: true }),
        Animated.timing(nextOpacity, { toValue: 1, duration: PUSH_MS, useNativeDriver: true }),
        Animated.timing(nextY, { toValue: 0, duration: PUSH_MS, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) {
          // Swap: incoming becomes current, reset values silently
          indexRef.current = nextIndex;
          setCurrentWord(incoming);
          currentOpacity.setValue(1);
          currentY.setValue(0);
          nextOpacity.setValue(0);
        }
      });

      timeout = setTimeout(cycle, DISPLAY_MS + PUSH_MS);
    };

    timeout = setTimeout(cycle, DISPLAY_MS);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <View style={styles.container}>
      {/* Current word — slides up and out */}
      <Animated.Text
        style={[style, { opacity: currentOpacity, transform: [{ translateY: currentY }] }]}
      >
        {currentWord}
      </Animated.Text>

      {/* Next word — comes from below and pushes in */}
      <Animated.Text
        style={[
          style,
          styles.absolute,
          { opacity: nextOpacity, transform: [{ translateY: nextY }] },
        ]}
      >
        {nextWord}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  absolute: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
