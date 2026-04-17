import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { useFonts } from 'expo-font';
import {
  NotoSerifJP_400Regular,
  NotoSerifJP_500Medium,
  NotoSerifJP_600SemiBold,
  NotoSerifJP_700Bold,
} from '@expo-google-fonts/noto-serif-jp';
import {
  NotoSansJP_400Regular,
  NotoSansJP_500Medium,
  NotoSansJP_600SemiBold,
  NotoSansJP_700Bold,
} from '@expo-google-fonts/noto-sans-jp';

import { colors, ColorTokens } from './colors';
import { typography, textVariants } from './typography';
import { spacing } from './spacing';
import { radius } from './radius';
import { shadows } from './shadows';

export { colors, typography, textVariants, spacing, radius, shadows };
export type { ColorTokens } from './colors';
export type { TextVariant } from './typography';

export interface Theme {
  colors: ColorTokens;
  typography: typeof typography;
  textVariants: typeof textVariants;
  spacing: typeof spacing;
  radius: typeof radius;
  shadows: typeof shadows;
  isDark: boolean;
}

const ThemeContext = createContext<Theme>({
  colors: colors.dark,
  typography,
  textVariants,
  spacing,
  radius,
  shadows,
  isDark: true,
});

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

// Font map for expo-font — all weights we use
export const fontAssets = {
  NotoSerifJP_400Regular,
  NotoSerifJP_500Medium,
  NotoSerifJP_600SemiBold,
  NotoSerifJP_700Bold,
  NotoSansJP_400Regular,
  NotoSansJP_500Medium,
  NotoSansJP_600SemiBold,
  NotoSansJP_700Bold,
};

// Hook to load all custom fonts
export function useYomiFonts() {
  return useFonts(fontAssets);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Force dark theme for now — can be toggled later
  const theme: Theme = {
    colors: colors.dark,
    typography,
    textVariants,
    spacing,
    radius,
    shadows,
    isDark: true,
  };

  return React.createElement(ThemeContext.Provider, { value: theme }, children);
}
