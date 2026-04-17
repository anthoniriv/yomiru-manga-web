import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'system' | 'light' | 'dark';

interface SettingsState {
  themeMode: ThemeMode;
  hasCompletedOnboarding: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setOnboardingComplete: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      hasCompletedOnboarding: false,
      setThemeMode: (mode) => set({ themeMode: mode }),
      setOnboardingComplete: () => set({ hasCompletedOnboarding: true }),
    }),
    {
      name: '@yomiru/settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
