# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yomiru (読みる — "to read") is a manga/book reader mobile app built with React Native 0.81 + Expo SDK 54. It lives in a monorepo at `apps/mobile/` and shares types with `@yomiru/shared`. The visual identity is a Japanese aesthetic inspired by sumi ink (墨), washi paper (和紙), and torii vermillion (鳥居).

## Commands

```bash
npx expo start            # Start dev server
npx expo start --ios      # iOS simulator
npx expo start --android  # Android emulator
npm run typecheck          # TypeScript strict type checking
eas build --profile development  # Dev build via EAS
```

## Architecture

**Routing:** Expo Router v6 with file-based routing and typed routes. Screens live in `app/`.

**Navigation flow:** `app/index.tsx` conditionally redirects:
- No onboarding → `/(auth)/onboarding`
- No session → `/(auth)/login`
- Authenticated → `/(tabs)` (Library, Add URL, Search, Profile)
- Book detail: `/(tabs)/book/[id]` — hidden from tab bar
- Reader: `/reader/[chapterId]` — full-screen, slide_from_right transition

**State management:** Zustand v5 stores in `store/`:
- `authStore` — Supabase auth, session, profile, language
- `libraryStore` — Books, filters (all/reading/completed/plan_to_read/dropped), progress tracking, optimistic updates with rollback
- `settingsStore` — AsyncStorage persisted (themeMode, hasCompletedOnboarding)

**Backend:** Supabase for auth + database. Custom API (`lib/api.ts`) with multi-candidate URL fallback and Bearer token injection.

**Reader caching:** Dual-mode in `lib/readerCache.ts` + `lib/readerContentCache.ts`:
- `auto`: 24h TTL
- `offline`: permanent in `documentDirectory/reader-cache/`

**i18n:** i18next with `en` and `es` (`lib/i18n/`). All user-facing strings must use translation keys.

## Design System — Japanese Aesthetic

### Color Palette (`theme/colors.ts`)

Two complete themes: `light` (washi paper) and `dark` (sumi ink). Currently forced dark.

**Dark mode tokens used everywhere:**
| Token | Value | Inspiration |
|---|---|---|
| `background` | `#0D0D14` | Deep sumi ink |
| `surface` | `#161622` | Lacquer panel |
| `surfaceSecondary` | `#1E1E2E` | Lifted surface |
| `surfaceTertiary` | `#262638` | Inset/tertiary |
| `text` | `#F0EDE8` | Aged paper white |
| `textSecondary` | `#9A9AAA` | Muted silver |
| `textTertiary` | `#636375` | Faint stone |
| `textInverse` | `#0D0D14` | For primary buttons |
| `accent` | `#D4564A` | Torii vermillion |
| `accentGold` | `#D4B373` | Washi gold |
| `success` | `#4A9B56` | Matcha green |
| `warning` | `#D4A23C` | Aged amber |
| `error` | `#D4564A` | Same as accent |
| `skeleton` / `shimmer` | surfaceSecondary/tertiary | For shimmer animation |

**Rules:**
- Never use hardcoded colors — always `theme.colors.*`
- Use `textInverse` for text on accent backgrounds, not `#FFFFFF`
- `accentGold` for decorative/star elements, `accent` for interactive
- Borders use rgba transparency (`border`, `borderMedium`, `borderAccent`)

### Typography (`theme/typography.ts`)

Two font families loaded via `useYomiFonts()` in root layout:
- **Display (headings):** Noto Serif JP — `displayRegular/Medium/SemiBold/Bold`
- **Body (text):** Noto Sans JP — `bodyRegular/Medium/SemiBold/Bold`

**Text variants (use via `<Text variant="...">`):**
| Variant | Font | Weight | Size | Use for |
|---|---|---|---|---|
| `displayLarge` | Serif Bold | 700 | 36 | App title "Yomiru" |
| `heading1` | Serif Bold | 700 | 30 | Screen titles |
| `heading2` | Serif SemiBold | 600 | 24 | Section titles, card titles |
| `heading3` | Serif SemiBold | 600 | 20 | Subsections |
| `body` | Sans Regular | 400 | 15 | Default body text |
| `bodyMedium` | Sans Medium | 500 | 15 | Emphasized body |
| `bodyLarge` | Sans Regular | 400 | 17 | Reader paragraphs |
| `caption` | Sans Regular | 400 | 13 | Secondary info |
| `label` | Sans Medium | 500 | 13 | Form labels, tab labels |
| `labelLarge` | Sans SemiBold | 600 | 15 | Emphasized labels |
| `small` | Sans Regular | 400 | 11 | Metadata, timestamps |
| `sectionHeader` | Sans Medium | 500 | 11 | Uppercase section headers |

**Rules:**
- Headings always use Serif (display). Body/UI always use Sans.
- `letterSpacing` scale: tighter(-0.8) for display, wide(0.4) for labels, widest(1.6) for sectionHeader
- Always use `fontFamily` from theme, never platform defaults

### Spacing (`theme/spacing.ts`)

4px base unit. Access via `theme.spacing[key]`:
```
0→0  1→4  2→8  3→12  4→16  5→20  6→24  8→32  10→40  12→48  16→64  20→80
```

### Border Radius (`theme/radius.ts`)

```
none→0  xs→4  sm→8  md→12  lg→16  xl→20  2xl→28  full→9999
```
- Tags/chips: `xs` (4)
- Inputs/buttons: `sm` (8) or `md` (12)
- Cards: `md` (12)
- Modals: `lg` (16)
- Back buttons: 10 (rounded square, not circle)
- Avatars: `full`

### Shadows (`theme/shadows.ts`)

5 levels: `xs`, `sm`, `md`, `lg`, `xl`. Warm-tinted with `#1A1A2E` base color. Platform-specific (iOS shadowX vs Android elevation).

## Component Library

14 components barrel-exported from `components/ui/index.ts`. Always import from there or individual files.

### Usage Patterns

**Button** — 4 variants:
```tsx
<Button title="Save" variant="primary" />          // Accent bg, inverse text
<Button title="Edit" variant="secondary" />         // Accent border, accent text
<Button title="Cancel" variant="ghost" />           // Transparent, accent text
<Button title="Delete" variant="danger" />          // Red border, red text
// Props: size="sm|md|lg", loading, disabled, icon, haptic (default true)
```

**BookCard** — For book grids (Library screen):
```tsx
<BookCard
  title={book.title}
  coverUrl={book.cover_image_url}
  progress={{ read: 5, total: 20 }}  // Shows progress bar on cover
  onPress={() => {}}
  animationDelay={index * 50}         // Stagger fade-in
/>
```

**SearchBar** — Dedicated search input:
```tsx
<SearchBar value={query} onChangeText={setQuery} placeholder="Search..." />
// Has animated border focus, clear button with haptic, Search icon
```

**Tag** — Filter chips:
```tsx
<Tag label="Reading" active={isActive} onPress={() => {}} />
// active: accent bg + inverse text. inactive: surface bg + border
```

**Avatar** — Profile pictures:
```tsx
<Avatar name="John" size={64} />
// Gradient from accent (torii red) → accentGold (washi gold)
```

**Rating** — Star display:
```tsx
<Rating value={4.5} maxStars={5} showValue size={16} />
// Stars filled with accentGold
```

**Skeleton** — Loading placeholders:
```tsx
<Skeleton width="100%" height={200} borderRadius={12} />
// Real shimmer with LinearGradient sweep, not just opacity pulse
```

**AppModal** — Confirmations:
```tsx
<AppModal
  visible={show}
  title="Delete?"
  message="This cannot be undone"
  actions={[
    { label: "Cancel", variant: "ghost", onPress: close },
    { label: "Delete", variant: "danger", onPress: handleDelete, loading },
  ]}
/>
// Spring scale entrance (0.92→1.0) + haptic on appear
```

## Animation Patterns

All animations in `hooks/useAnimations.ts`. Use React Native `Animated` API with native driver.

| Hook | Use for | Duration |
|---|---|---|
| `useFadeIn(delay)` | Mount fade-in, stagger with delay | 400ms |
| `useSlideUp(delay)` | Screen section entrances (header, form, footer) | 450ms |
| `useScalePress(0.96)` | Press feedback on cards/buttons | Spring |
| `useStaggeredFadeIn(count, 50)` | List item cascade entrance | 350ms × count |
| `usePulse()` | Attention-drawing subtle oscillation | 2000ms loop |
| `useModalEntrance(visible)` | Modal/sheet spring entrance | Spring |
| `useShimmer(width)` | Skeleton shimmer translateX | 1500ms loop |

**Screen entrance pattern (used in every screen):**
```tsx
const headerAnim = useSlideUp(0);
const contentAnim = useSlideUp(100);
const footerAnim = useFadeIn(300);

<Animated.View style={headerAnim.style}>...</Animated.View>
<Animated.View style={contentAnim.style}>...</Animated.View>
<Animated.View style={footerAnim.style}>...</Animated.View>
```

## Haptic Feedback Conventions

Uses `expo-haptics`. Import: `import * as Haptics from 'expo-haptics'`.

| Action type | Haptic style |
|---|---|
| Navigation (back, tab) | `ImpactFeedbackStyle.Light` |
| Selection (filter, language) | `ImpactFeedbackStyle.Light` |
| Confirmation (sign out, modal open) | `ImpactFeedbackStyle.Medium` |
| Destructive (delete account) | `ImpactFeedbackStyle.Heavy` |
| Async success | `NotificationFeedbackType.Success` |
| Async error | `NotificationFeedbackType.Error` |

Button component has `haptic` prop (default `true`) — Light impact on every press.

## Screen Patterns

**Screen header pattern:**
```tsx
<Animated.View style={[styles.header, headerAnim.style]}>
  <Text variant="heading1">{title}</Text>
</Animated.View>
// paddingHorizontal: 20, paddingTop: 12-16
```

**Back button pattern:**
```tsx
<Pressable
  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
  style={[styles.backButton, { backgroundColor: theme.colors.surfaceSecondary }]}
>
  <ChevronLeft size={18} color={theme.colors.text} />
</Pressable>
// backButton: width 34, height 34, borderRadius 10 (rounded square)
```

**Featured card pattern (Library):**
Uses `LinearGradient` overlay on cover image with 3 stops: `['transparent', 'rgba(13,13,20,0.75)', 'rgba(13,13,20,0.95)']`.

**Book detail hero:**
Full-width cover image with `LinearGradient` that fades into `theme.colors.background`. Info section has negative marginTop (-24) to overlap.

**Loading/splash branding:**
Root index and splash screen show "Yomiru" in `displayLarge` + "読みる" in accent color + small spinner.

**Library greeting:**
Japanese greeting based on time of day: おはよう (morning) / こんにちは (afternoon) / こんばんは (evening).

## File Structure Conventions

- Screens: `app/` — Expo Router file-based routing
- UI components: `components/ui/` — all theme-aware, barrel export from `index.ts`
- Layout components: `components/layout/` — SafeArea, Header, EmptyState
- Hooks: `hooks/` — animation utilities
- Theme: `theme/` — colors, typography, spacing, radius, shadows, index (provider + font loading)
- State: `store/` — Zustand stores
- Utils: `lib/` — API client, Supabase, caching, i18n

## Important Technical Notes

- **Fonts:** Loaded in `app/_layout.tsx` via `useYomiFonts()`. App doesn't render until fonts are ready.
- **Reanimated:** Installed (`react-native-reanimated ~4.1.1`) but NOT in `app.json` plugins — Expo SDK 54 + New Architecture doesn't need the config plugin. Uses Animated API currently; Reanimated available for future use.
- **ColorTokens type:** Uses structural type (`{ [K in keyof typeof colors.light]: string }`) so both light and dark schemes satisfy the same type despite different literal values.
- **Icons:** `lucide-react-native` exclusively. Size 18 for inline/buttons, 22 for tabs, 32 for empty states. StrokeWidth: 1.5-2.
- **Images:** `expo-image` with `cachePolicy="memory-disk"` and `transition={200-300}`.
- **Monorepo:** Metro watches both local and root `node_modules`. Shared package at `../../packages/shared/src`. Dependencies may need root-level install.

## Path Aliases

- `@/*` → project root (e.g., `@/components/ui/Button`)
- `@yomiru/shared` → `../../packages/shared/src`

## Environment Variables

Required in `.env`:
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_API_PORT  # default 3001
```
