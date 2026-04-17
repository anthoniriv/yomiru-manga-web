import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { SafeArea } from '../../components/layout/SafeArea';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Rating } from '../../components/ui/Rating';
import { Skeleton } from '../../components/ui/Skeleton';
import { AppModal } from '../../components/ui/AppModal';
import { Link2 } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { useSlideUp } from '../../hooks/useAnimations';
import { ScrapeResult, ReadingStatus } from '@yomiru/shared';
import { apiPost } from '../../lib/api';
import { useLibraryStore } from '../../store/libraryStore';

export default function AddUrlScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const fetchBooks = useLibraryStore((s) => s.fetchBooks);

  const headerAnim = useSlideUp(0);

  const [url, setUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onClose?: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setUrl(text);
      }
    } catch {}
  };

  const handleScan = async () => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) return;

    try {
      new URL(normalizedUrl);
    } catch {
      setError(t('addUrl.invalidUrl'));
      return;
    }

    setIsScanning(true);
    setError(null);
    setResult(null);

    try {
      const data = await apiPost<ScrapeResult>('/api/scrape', { url: normalizedUrl });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(data);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSave = async () => {
    if (!result?.title) return;

    setIsSaving(true);
    try {
      await apiPost('/api/books', {
        title: result.title,
        source_url: result.source_url,
        cover_image_url: result.cover_image_url,
        rating: result.rating,
        description: result.description,
        source_domain: result.source_domain,
        status: ReadingStatus.PLAN_TO_READ,
        chapters: result.chapters,
      });

      await fetchBooks();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFeedbackModal({
        visible: true,
        title: t('addUrl.scanComplete'),
        message: '',
        onClose: () => {
          setUrl('');
          setResult(null);
          router.push('/(tabs)');
        },
      });
    } catch (err) {
      setFeedbackModal({
        visible: true,
        title: t('common.error'),
        message: err instanceof Error ? err.message : 'Save failed',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeArea>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Animated.View style={headerAnim.style}>
          <Text variant="heading1" style={styles.title}>{t('addUrl.title')}</Text>
        </Animated.View>

        <View style={styles.inputRow}>
          <Input
            placeholder={t('addUrl.placeholder')}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            containerStyle={styles.urlInput}
            leftIcon={<Link2 size={18} color={theme.colors.textTertiary} />}
          />
          <Button
            title={t('addUrl.paste')}
            variant="ghost"
            size="sm"
            onPress={handlePaste}
          />
        </View>

        <Button
          title={isScanning ? t('addUrl.scanning') : t('addUrl.scan')}
          onPress={handleScan}
          loading={isScanning}
          disabled={!url.trim() || isScanning}
          style={styles.scanButton}
        />

        {error && (
          <Card variant="flat" style={[styles.errorCard, { borderColor: theme.colors.error }]}>
            <Text variant="body" color={theme.colors.error}>{error}</Text>
          </Card>
        )}

        {isScanning && (
          <View style={styles.skeletonContainer}>
            <Skeleton width="100%" height={200} borderRadius={12} />
            <Skeleton width="70%" height={24} style={{ marginTop: 12 }} />
            <Skeleton width="40%" height={16} style={{ marginTop: 8 }} />
          </View>
        )}

        {result && (
          <Card style={styles.previewCard}>
            {result.cover_image_url && (
              <Image
                source={{ uri: result.cover_image_url }}
                style={[styles.previewCover, { borderTopLeftRadius: theme.radius.md, borderTopRightRadius: theme.radius.md }]}
                contentFit="cover"
                transition={200}
              />
            )}
            <View style={styles.previewInfo}>
              <Text variant="heading3">{result.title || 'Unknown Title'}</Text>

              {result.rating != null && (
                <Rating value={result.rating / 2} showValue />
              )}

              <Badge
                label={t('addUrl.chaptersFound', { count: result.chapters.length })}
                size="md"
              />

              {result.description && (
                <Text
                  variant="caption"
                  color={theme.colors.textSecondary}
                  numberOfLines={3}
                  style={styles.description}
                >
                  {result.description}
                </Text>
              )}

              {result.warnings.length > 0 && (
                <View style={styles.warnings}>
                  <Text variant="small" color={theme.colors.warning}>
                    {t('addUrl.warnings')}
                  </Text>
                  {result.warnings.map((w, i) => (
                    <Text key={i} variant="small" color={theme.colors.textTertiary}>
                      - {w}
                    </Text>
                  ))}
                </View>
              )}

              <Button
                title={t('addUrl.addToLibrary')}
                onPress={handleSave}
                loading={isSaving}
                style={styles.saveButton}
              />
            </View>
          </Card>
        )}
      </ScrollView>

      <AppModal
        visible={feedbackModal.visible}
        title={feedbackModal.title}
        message={feedbackModal.message}
        onRequestClose={() => {
          const callback = feedbackModal.onClose;
          setFeedbackModal({ visible: false, title: '', message: '' });
          callback?.();
        }}
        actions={[
          {
            label: 'OK',
            onPress: () => {
              const callback = feedbackModal.onClose;
              setFeedbackModal({ visible: false, title: '', message: '' });
              callback?.();
            },
          },
        ]}
      />
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  title: { marginBottom: 24 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  urlInput: { flex: 1 },
  scanButton: { marginTop: 16, width: '100%' },
  errorCard: { marginTop: 16, padding: 16 },
  skeletonContainer: { marginTop: 24 },
  previewCard: { marginTop: 24, overflow: 'hidden' },
  previewCover: { width: '100%', height: 200 },
  previewInfo: { padding: 16, gap: 8 },
  description: { marginTop: 4 },
  warnings: { marginTop: 8, gap: 2 },
  saveButton: { marginTop: 12, width: '100%' },
});
