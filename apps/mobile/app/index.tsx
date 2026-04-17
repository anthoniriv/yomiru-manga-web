import { Redirect } from 'expo-router';
import { View, ActivityIndicator, Animated } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTheme } from '../theme';
import { Text } from '../components/ui/Text';
import { useFadeIn } from '../hooks/useAnimations';

export default function Index() {
  const { session, isLoading, isInitialized } = useAuthStore();
  const hasCompletedOnboarding = useSettingsStore((s) => s.hasCompletedOnboarding);
  const theme = useTheme();
  const fadeIn = useFadeIn();

  if (!isInitialized || isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <Animated.View style={[{ alignItems: 'center', gap: 12 }, fadeIn.style]}>
          <Text variant="displayLarge">Yomiru</Text>
          <Text variant="heading3" color={theme.colors.accent}>読みる</Text>
          <ActivityIndicator
            size="small"
            color={theme.colors.accent}
            style={{ marginTop: 16 }}
          />
        </Animated.View>
      </View>
    );
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href="/(tabs)" />;
}
