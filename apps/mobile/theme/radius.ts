// Border radius — leaning slightly rounded for warmth
// Japanese aesthetic: not overly sharp (cold) nor bubbly (playful)
export const radius = {
  none: 0,
  xs: 4,    // Subtle — tags, small chips
  sm: 8,    // Standard — inputs, small buttons
  md: 12,   // Cards — default container radius
  lg: 16,   // Large cards, modals
  xl: 20,   // Bottom sheets, feature cards
  '2xl': 28, // Hero elements
  full: 9999, // Pills, avatars, circular
} as const;

export type RadiusKey = keyof typeof radius;
