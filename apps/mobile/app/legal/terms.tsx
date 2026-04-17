import React from 'react';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { SafeArea } from '../../components/layout/SafeArea';
import { Text } from '../../components/ui/Text';
import { useTheme } from '../../theme';

export default function TermsOfServiceScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <SafeArea edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={[styles.backButton, { backgroundColor: theme.colors.surfaceSecondary }]}
        >
          <ChevronLeft size={18} color={theme.colors.text} />
        </Pressable>
        <Text variant="heading3">{t('legal.termsTitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="caption" color={theme.colors.textTertiary}>
          {t('legal.lastUpdated', { date: '2026-02-25' })}
        </Text>

        <Text variant="body" color={theme.colors.textSecondary} style={styles.paragraph}>
          {t('legal.termsIntro')}
        </Text>
        <Text variant="body" color={theme.colors.textSecondary} style={styles.paragraph}>
          {t('legal.termsUsage')}
        </Text>
        <Text variant="body" color={theme.colors.textSecondary} style={styles.paragraph}>
          {t('legal.termsSources')}
        </Text>
        <Text variant="body" color={theme.colors.textSecondary} style={styles.paragraph}>
          {t('legal.termsAccount')}
        </Text>
        <Text variant="body" color={theme.colors.textSecondary} style={styles.paragraph}>
          {t('legal.termsLiability')}
        </Text>
        <Text variant="body" color={theme.colors.textSecondary} style={styles.paragraph}>
          {t('legal.termsContact')}
        </Text>
      </ScrollView>
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 4,
  },
  paragraph: {
    lineHeight: 24,
    marginTop: 8,
  },
});
