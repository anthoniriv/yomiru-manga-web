import { Platform, ViewStyle } from 'react-native';

type ShadowStyle = Pick<ViewStyle, 'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'>;

// Shadows — warm-tinted, soft diffusion
// Japanese aesthetic: gentle, never harsh or dramatic
const createShadow = (
  offsetY: number,
  opacity: number,
  blurRadius: number,
  elevation: number,
  color = '#1A1A2E',
): ShadowStyle =>
  Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: blurRadius,
    },
    android: {
      elevation,
    },
    default: {},
  }) as ShadowStyle;

export const shadows = {
  // Whisper — barely perceptible lift
  xs: createShadow(1, 0.06, 2, 1),
  // Subtle — cards at rest
  sm: createShadow(1, 0.10, 4, 2),
  // Medium — elevated cards, dropdowns
  md: createShadow(2, 0.12, 8, 4),
  // Large — modals, bottom sheets
  lg: createShadow(4, 0.14, 16, 8),
  // XLarge — hero cards, floating elements
  xl: createShadow(8, 0.16, 24, 12),
} as const;
