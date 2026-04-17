import { Platform } from 'react-native';

// Font family names as they register with expo-font
// Display: Noto Serif JP — elegant Japanese serif for headings
// Body: Noto Sans JP — clean Japanese sans for readability
// Fallback: system fonts when custom fonts haven't loaded
const systemFont = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

export const fontFamilies = {
  // Display — Noto Serif JP
  displayRegular: 'NotoSerifJP_400Regular',
  displayMedium: 'NotoSerifJP_500Medium',
  displaySemiBold: 'NotoSerifJP_600SemiBold',
  displayBold: 'NotoSerifJP_700Bold',
  // Body — Noto Sans JP
  bodyRegular: 'NotoSansJP_400Regular',
  bodyMedium: 'NotoSansJP_500Medium',
  bodySemiBold: 'NotoSansJP_600SemiBold',
  bodyBold: 'NotoSansJP_700Bold',
  // System fallbacks
  system: systemFont!,
} as const;

export const typography = {
  families: {
    regular: fontFamilies.bodyRegular,
    medium: fontFamilies.bodyMedium,
    semiBold: fontFamilies.bodySemiBold,
    bold: fontFamilies.bodyBold,
    displayRegular: fontFamilies.displayRegular,
    displayMedium: fontFamilies.displayMedium,
    displaySemiBold: fontFamilies.displaySemiBold,
    displayBold: fontFamilies.displayBold,
    system: fontFamilies.system,
  },
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 44,
  },
  lineHeights: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.65,
  },
  letterSpacing: {
    tighter: -0.8,
    tight: -0.4,
    normal: 0,
    wide: 0.4,
    wider: 0.8,
    widest: 1.6,
  },
} as const;

// Text variants — each variant is a complete typographic style
export const textVariants = {
  // Display headings — Noto Serif JP for Japanese elegance
  displayLarge: {
    fontFamily: fontFamilies.displayBold,
    fontWeight: '700' as const,
    fontSize: typography.sizes['4xl'],
    lineHeight: typography.sizes['4xl'] * typography.lineHeights.tight,
    letterSpacing: typography.letterSpacing.tighter,
  },
  heading1: {
    fontFamily: fontFamilies.displayBold,
    fontWeight: '700' as const,
    fontSize: typography.sizes['3xl'],
    lineHeight: typography.sizes['3xl'] * typography.lineHeights.tight,
    letterSpacing: typography.letterSpacing.tight,
  },
  heading2: {
    fontFamily: fontFamilies.displaySemiBold,
    fontWeight: '600' as const,
    fontSize: typography.sizes['2xl'],
    lineHeight: typography.sizes['2xl'] * typography.lineHeights.tight,
    letterSpacing: typography.letterSpacing.tight,
  },
  heading3: {
    fontFamily: fontFamilies.displaySemiBold,
    fontWeight: '600' as const,
    fontSize: typography.sizes.xl,
    lineHeight: typography.sizes.xl * typography.lineHeights.snug,
    letterSpacing: typography.letterSpacing.normal,
  },
  // Body text — Noto Sans JP for readability
  body: {
    fontFamily: fontFamilies.bodyRegular,
    fontWeight: '400' as const,
    fontSize: typography.sizes.base,
    lineHeight: typography.sizes.base * typography.lineHeights.normal,
    letterSpacing: typography.letterSpacing.normal,
  },
  bodyMedium: {
    fontFamily: fontFamilies.bodyMedium,
    fontWeight: '500' as const,
    fontSize: typography.sizes.base,
    lineHeight: typography.sizes.base * typography.lineHeights.normal,
    letterSpacing: typography.letterSpacing.normal,
  },
  bodyLarge: {
    fontFamily: fontFamilies.bodyRegular,
    fontWeight: '400' as const,
    fontSize: typography.sizes.lg,
    lineHeight: typography.sizes.lg * typography.lineHeights.relaxed,
    letterSpacing: typography.letterSpacing.normal,
  },
  // UI text — labels, captions, buttons
  caption: {
    fontFamily: fontFamilies.bodyRegular,
    fontWeight: '400' as const,
    fontSize: typography.sizes.sm,
    lineHeight: typography.sizes.sm * typography.lineHeights.normal,
    letterSpacing: typography.letterSpacing.normal,
  },
  label: {
    fontFamily: fontFamilies.bodyMedium,
    fontWeight: '500' as const,
    fontSize: typography.sizes.sm,
    lineHeight: typography.sizes.sm * typography.lineHeights.normal,
    letterSpacing: typography.letterSpacing.wide,
  },
  labelLarge: {
    fontFamily: fontFamilies.bodySemiBold,
    fontWeight: '600' as const,
    fontSize: typography.sizes.base,
    lineHeight: typography.sizes.base * typography.lineHeights.normal,
    letterSpacing: typography.letterSpacing.wide,
  },
  small: {
    fontFamily: fontFamilies.bodyRegular,
    fontWeight: '400' as const,
    fontSize: typography.sizes.xs,
    lineHeight: typography.sizes.xs * typography.lineHeights.normal,
    letterSpacing: typography.letterSpacing.wide,
  },
  // Special — section headers with wider spacing
  sectionHeader: {
    fontFamily: fontFamilies.bodyMedium,
    fontWeight: '500' as const,
    fontSize: typography.sizes.xs,
    lineHeight: typography.sizes.xs * typography.lineHeights.normal,
    letterSpacing: typography.letterSpacing.widest,
    textTransform: 'uppercase' as const,
  },
} as const;

export type TextVariant = keyof typeof textVariants;
