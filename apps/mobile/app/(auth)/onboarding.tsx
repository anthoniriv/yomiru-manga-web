import React from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { SafeArea } from '../../components/layout/SafeArea';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { BookMarked, Compass } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { useSettingsStore } from '../../store/settingsStore';
import { useSlideUp, useFadeIn } from '../../hooks/useAnimations';
import { changeLanguage } from '../../lib/i18n';

export default function OnboardingScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const setOnboardingComplete = useSettingsStore((s) => s.setOnboardingComplete);
  const currentLang = i18n.language;

  const headerAnim = useSlideUp(0);
  const langAnim = useSlideUp(100);
  const featuresAnim = useSlideUp(200);
  const footerAnim = useFadeIn(400);

  const selectLanguage = async (lang: 'en' | 'es') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await changeLanguage(lang);
  };

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setOnboardingComplete();
    router.replace('/(auth)/login');
  };

  return (
    <SafeArea style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.header, headerAnim.style]}>
          <Text variant="displayLarge" align="center">
            Yomiru
          </Text>
          <Text
            variant="heading3"
            color={theme.colors.accent}
            align="center"
            style={styles.kanji}
          >
            読みる
          </Text>
          <Text
            variant="body"
            color={theme.colors.textSecondary}
            align="center"
            style={styles.subtitle}
          >
            {t('onboarding.subtitle')}
          </Text>
        </Animated.View>

        <Animated.View style={[styles.languageSection, langAnim.style]}>
          <Text variant="label" color={theme.colors.textSecondary} align="center" style={styles.sectionTitle}>
            {t('onboarding.selectLanguage')}
          </Text>

          <View style={styles.languageCards}>
            <Pressable
              onPress={() => selectLanguage('en')}
              style={[
                styles.langCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: currentLang === 'en' ? theme.colors.accent : theme.colors.border,
                  borderWidth: currentLang === 'en' ? 2 : 1,
                },
              ]}
            >
              <Text variant="heading2" align="center">EN</Text>
              <Text variant="caption" color={theme.colors.textSecondary} align="center">
                English
              </Text>
            </Pressable>

            <Pressable
              onPress={() => selectLanguage('es')}
              style={[
                styles.langCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: currentLang === 'es' ? theme.colors.accent : theme.colors.border,
                  borderWidth: currentLang === 'es' ? 2 : 1,
                },
              ]}
            >
              <Text variant="heading2" align="center">ES</Text>
              <Text variant="caption" color={theme.colors.textSecondary} align="center">
                Espanol
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View style={[styles.features, featuresAnim.style]}>
          <FeatureItem
            title={t('onboarding.slide1Title')}
            description={t('onboarding.slide1Desc')}
            theme={theme}
            icon={<BookMarked size={18} color={theme.colors.accent} strokeWidth={1.8} />}
          />
          <FeatureItem
            title={t('onboarding.slide2Title')}
            description={t('onboarding.slide2Desc')}
            theme={theme}
            icon={<Compass size={18} color={theme.colors.accentGold} strokeWidth={1.8} />}
          />
        </Animated.View>
      </View>

      <Animated.View style={[styles.footer, footerAnim.style]}>
        <Button
          title={t('onboarding.getStarted')}
          onPress={handleGetStarted}
          size="lg"
          style={styles.button}
        />
      </Animated.View>
    </SafeArea>
  );
}

function FeatureItem({ title, description, theme, icon }: { title: string; description: string; theme: any; icon?: React.ReactNode }) {
  return (
    <View style={featureStyles.container}>
      <View style={[featureStyles.iconWrap, { backgroundColor: theme.colors.surfaceSecondary }]}>
        {icon || <View style={[featureStyles.dot, { backgroundColor: theme.colors.accent }]} />}
      </View>
      <View style={featureStyles.text}>
        <Text variant="bodyMedium">{title}</Text>
        <Text variant="caption" color={theme.colors.textSecondary}>{description}</Text>
      </View>
    </View>
  );
}

const featureStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, gap: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  kanji: { marginTop: 4 },
  subtitle: { marginTop: 12 },
  languageSection: { marginBottom: 40 },
  sectionTitle: { marginBottom: 16 },
  languageCards: { flexDirection: 'row', gap: 16 },
  langCard: {
    flex: 1,
    paddingVertical: 24,
    borderRadius: 12,
    alignItems: 'center',
    gap: 4,
  },
  features: { paddingHorizontal: 8 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
  button: { width: '100%' },
});
