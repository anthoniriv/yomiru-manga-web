import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Animated, Easing } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useYomiFonts } from '../theme';
import { colors } from '../theme/colors';
import { useAuthStore } from '../store/authStore';
import '../lib/i18n';

function SplashContent() {
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, []);

  return (
    <View style={{
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.dark.background,
    }}>
      <Animated.View style={{ opacity, alignItems: 'center', gap: 16 }}>
        <Animated.Text style={{
          fontSize: 36,
          fontWeight: '700',
          color: colors.dark.text,
          letterSpacing: -0.8,
        }}>
          Yomiru
        </Animated.Text>
        <Animated.Text style={{
          fontSize: 16,
          color: colors.dark.accent,
          letterSpacing: 0.4,
        }}>
          読みる
        </Animated.Text>
        <ActivityIndicator
          size="small"
          color={colors.dark.accent}
          style={{ marginTop: 24 }}
        />
      </Animated.View>
    </View>
  );
}

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const [ready, setReady] = useState(false);
  const [fontsLoaded] = useYomiFonts();

  useEffect(() => {
    async function boot() {
      try {
        await initialize();
      } catch (e) {
        console.warn('Auth init failed:', e);
      } finally {
        setReady(true);
      }
    }
    boot();
  }, []);

  if (!ready || !fontsLoaded) {
    return <SplashContent />;
  }

  return (
    <ThemeProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.dark.background },
          animation: 'fade',
          animationDuration: 250,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="reader"
          options={{
            animation: 'slide_from_right',
            animationDuration: 300,
          }}
        />
        <Stack.Screen name="legal" />
      </Stack>
    </ThemeProvider>
  );
}
