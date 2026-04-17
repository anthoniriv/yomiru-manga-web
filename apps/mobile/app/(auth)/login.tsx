import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeArea } from '../../components/layout/SafeArea';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Mail, Lock } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { useSlideUp, useFadeIn } from '../../hooks/useAnimations';

export default function LoginScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { signInWithEmail, isLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const headerAnim = useSlideUp(0);
  const formAnim = useSlideUp(100);
  const footerAnim = useFadeIn(300);

  const handleLogin = async () => {
    if (!email || !password) return;
    try {
      await signInWithEmail(email, password);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : 'Login failed');
    }
  };

  return (
    <SafeArea style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[styles.header, headerAnim.style]}>
              <Text variant="displayLarge" align="center">Yomiru</Text>
              <Text
                variant="heading3"
                color={theme.colors.accent}
                align="center"
                style={styles.kanji}
              >
                読みる
              </Text>
              <Text variant="body" color={theme.colors.textSecondary} align="center" style={styles.subtitle}>
                {t('auth.login')}
              </Text>
            </Animated.View>

            <Animated.View style={[styles.form, formAnim.style]}>
              <Input
                label={t('auth.email')}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                leftIcon={<Mail size={18} color={theme.colors.textTertiary} />}
              />
              <Input
                label={t('auth.password')}
                value={password}
                onChangeText={setPassword}
                placeholder="********"
                secureTextEntry
                containerStyle={styles.passwordInput}
                leftIcon={<Lock size={18} color={theme.colors.textTertiary} />}
              />
              <Button
                title={t('auth.signIn')}
                onPress={handleLogin}
                loading={isLoading}
                disabled={!email || !password}
                style={styles.loginButton}
              />
            </Animated.View>

            <Animated.View style={[styles.footer, footerAnim.style]}>
              <Text variant="caption" color={theme.colors.textSecondary}>
                {t('auth.noAccount')}{' '}
              </Text>
              <Button
                title={t('auth.signUp')}
                variant="ghost"
                size="sm"
                onPress={() => router.push('/(auth)/register')}
              />
            </Animated.View>
          </ScrollView>
      </KeyboardAvoidingView>
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', paddingVertical: 40 },
  header: { marginBottom: 32, alignItems: 'center' },
  kanji: { marginTop: 4 },
  subtitle: { marginTop: 12 },
  form: {},
  passwordInput: { marginTop: 16 },
  loginButton: { marginTop: 24, width: '100%' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
});
