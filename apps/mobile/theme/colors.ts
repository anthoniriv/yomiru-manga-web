// Yomiru — 読 (to read) Japanese library theme
// Inspired by sumi ink (墨), washi paper (和紙), torii vermillion (鳥居),
// and the quiet warmth of a Japanese reading room

export const colors = {
  light: {
    // Surfaces — warm parchment tones (washi paper)
    background: '#FAF7F2',          // Washi — warm bone white
    surface: '#FFFFFF',              // Pure white cards with warmth
    surfaceSecondary: '#F3EDE4',    // Aged parchment
    surfaceTertiary: '#EBE3D7',     // Deeper parchment for insets

    // Text — sumi ink hierarchy
    text: '#1A1A2E',                // Sumi ink — warm dark indigo
    textSecondary: '#4A4A5A',       // Faded ink
    textTertiary: '#8A8A96',        // Ghost ink
    textInverse: '#FAF7F2',         // For dark backgrounds

    // Brand — torii red & washi gold
    accent: '#B33B2E',              // Torii vermillion — warm muted red
    accentLight: '#D4564A',         // Lighter torii
    accentSurface: 'rgba(179, 59, 46, 0.08)', // Torii tint on surfaces
    accentGold: '#C4A265',          // Washi gold — aged paper accent
    accentGoldSurface: 'rgba(196, 162, 101, 0.10)',

    // Borders — subtle ink lines
    border: 'rgba(26, 26, 46, 0.08)',
    borderMedium: 'rgba(26, 26, 46, 0.14)',
    borderAccent: 'rgba(179, 59, 46, 0.20)',

    // Semantic
    success: '#3A7D44',             // Matcha green — natural
    warning: '#C48B2C',             // Amber — aged gold
    error: '#B33B2E',               // Same as accent — torii red
    info: '#4A6FA5',                // Indigo blue — ceramic

    // System
    overlay: 'rgba(26, 26, 46, 0.60)',
    tabBar: '#FAF7F2',
    tabBarBorder: 'rgba(26, 26, 46, 0.06)',
    skeleton: '#EBE3D7',
    shimmer: '#F3EDE4',
  },

  dark: {
    // Surfaces — sumi ink depths
    background: '#0D0D14',          // Deep sumi — almost black with indigo
    surface: '#161622',             // Dark lacquer panel
    surfaceSecondary: '#1E1E2E',    // Slightly lifted surface
    surfaceTertiary: '#262638',     // Tertiary elevation

    // Text — paper on ink
    text: '#F0EDE8',                // Warm off-white — aged paper tone
    textSecondary: '#9A9AAA',       // Muted silver
    textTertiary: '#636375',        // Faint stone
    textInverse: '#0D0D14',         // For light backgrounds

    // Brand — torii red & gold in dark context
    accent: '#D4564A',              // Brighter torii for dark bg
    accentLight: '#E8736A',         // Lighter variant
    accentSurface: 'rgba(212, 86, 74, 0.12)',
    accentGold: '#D4B373',          // Brighter gold on dark
    accentGoldSurface: 'rgba(212, 179, 115, 0.10)',

    // Borders — faint light on dark
    border: 'rgba(240, 237, 232, 0.07)',
    borderMedium: 'rgba(240, 237, 232, 0.12)',
    borderAccent: 'rgba(212, 86, 74, 0.25)',

    // Semantic — slightly desaturated for dark mode
    success: '#4A9B56',
    warning: '#D4A23C',
    error: '#D4564A',
    info: '#5A82B8',

    // System
    overlay: 'rgba(13, 13, 20, 0.85)',
    tabBar: '#121220',
    tabBarBorder: 'rgba(240, 237, 232, 0.06)',
    skeleton: '#1E1E2E',
    shimmer: '#262638',
  },
} as const;

export type ColorScheme = keyof typeof colors;

// Use a structural type so both light and dark satisfy it (different literal string values)
export type ColorTokens = {
  [K in keyof typeof colors.light]: string;
};
