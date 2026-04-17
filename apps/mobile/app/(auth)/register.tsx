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
import { User as UserIcon, Mail, Lock } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { useSlideUp, useFadeIn } from '../../hooks/useAnimations';

export default function RegisterScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { signUpWithEmail, isLoading } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const headerAnim = useSlideUp(0);
  const formAnim = useSlideUp(100);
  const footerAnim = useFadeIn(300);

  const handleRegister = async () => {
    if (!email || !password || !name) return;
    try {
      await signUpWithEmail(email, password, name, i18n.language);
      Alert.alert(
        t('common.success') || 'Success',
        'Account created! Please check your email to confirm.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : 'Registration failed');
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
                {t('auth.register')}
              </Text>
            </Animated.View>

            <Animated.View style={[styles.form, formAnim.style]}>
              <Input
                label={t('auth.name')}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                autoCapitalize="words"
                leftIcon={<UserIcon size={18} color={theme.colors.textTertiary} />}
              />
              <Input
                label={t('auth.email')}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                containerStyle={styles.fieldGap}
                leftIcon={<Mail size={18} color={theme.colors.textTertiary} />}
              />
              <Input
                label={t('auth.password')}
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 6 characters"
                secureTextEntry
                containerStyle={styles.fieldGap}
                leftIcon={<Lock size={18} color={theme.colors.textTertiary} />}
              />
              <Button
                title={t('auth.signUp')}
                onPress={handleRegister}
                loading={isLoading}
                disabled={!email || !password || !name}
                style={styles.registerButton}
              />
            </Animated.View>

            <Animated.View style={[styles.footer, footerAnim.style]}>
              <Text variant="caption" color={theme.colors.textSecondary}>
                {t('auth.hasAccount')}{' '}
              </Text>
              <Button
                title={t('auth.signIn')}
                variant="ghost"
                size="sm"
                onPress={() => router.back()}
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
  fieldGap: { marginTop: 16 },
  registerButton: { marginTop: 24, width: '100%' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
});
