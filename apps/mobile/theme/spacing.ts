// Ma (間) — the Japanese concept of negative space
// 4px base unit for consistent visual rhythm
// Named after the spacing's purpose, not just its size
export const spacing = {
  0: 0,
  1: 4,    // Micro — icon gaps, tight pairs
  2: 8,    // Compact — within components
  3: 12,   // Standard — component internal
  4: 16,   // Comfortable — card padding, list gaps
  5: 20,   // Moderate — section content
  6: 24,   // Spacious — between related groups
  8: 32,   // Section — between distinct groups
  10: 40,  // Major — screen section gaps
  12: 48,  // Large — hero spacing
  16: 64,  // XLarge — major visual breaks
  20: 80,  // XXLarge — screen-level spacing
} as const;

export type SpacingKey = keyof typeof spacing;
