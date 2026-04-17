import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Animated, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { SafeArea } from '../../components/layout/SafeArea';
import { Text } from '../../components/ui/Text';
import { Card } from '../../components/ui/Card';
import { Divider } from '../../components/ui/Divider';
import { AppModal } from '../../components/ui/AppModal';
import { Avatar } from '../../components/ui/Avatar';
import { Globe, Info, ChevronRight, LogOut, Shield, FileText, Trash2 } from 'lucide-react-native';
import { useSlideUp, useFadeIn } from '../../hooks/useAnimations';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { useLibraryStore } from '../../store/libraryStore';
import { changeLanguage } from '../../lib/i18n';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { profile, signOut, deleteAccount, updateLanguage } = useAuthStore();
  const books = useLibraryStore((s) => s.books);

  const headerAnim = useSlideUp(0);
  const profileAnim = useSlideUp(80);
  const settingsAnim = useFadeIn(200);

  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  const handleLanguageToggle = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newLang = i18n.language === 'en' ? 'es' : 'en';
    await changeLanguage(newLang as 'en' | 'es');
    await updateLanguage(newLang as 'en' | 'es');
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    try {
      setIsSigningOut(true);
      await signOut();
      router.replace('/(auth)/login');
    } catch (error) {
      setFeedbackModal({
        visible: true,
        title: t('common.error'),
        message: error instanceof Error ? error.message : t('profile.signOutError'),
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDeleting) return;
    try {
      setIsDeleting(true);
      await deleteAccount();
      router.replace('/(auth)/login');
    } catch (error) {
      setFeedbackModal({
        visible: true,
        title: t('common.error'),
        message: error instanceof Error ? error.message : t('profile.deleteAccountError'),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SafeArea>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.header, headerAnim.style]}>
          <Text variant="heading1">{t('profile.title')}</Text>
        </Animated.View>

        <Animated.View style={[styles.content, profileAnim.style]}>
          <Card style={styles.profileCard}>
            <Avatar name={profile?.name || profile?.email} size={64} />
            <View style={styles.profileInfo}>
              <Text variant="heading3">{profile?.name || 'User'}</Text>
              <Text variant="caption" color={theme.colors.textSecondary}>{profile?.email}</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text variant="heading3">{books.length}</Text>
                <Text variant="small" color={theme.colors.textTertiary}>
                  {t('library.title')}
                </Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
              <View style={styles.statItem}>
                <Text variant="heading3">
                  {books.filter(b => b.status === 'completed').length}
                </Text>
                <Text variant="small" color={theme.colors.textTertiary}>
                  {t('library.completed')}
                </Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
              <View style={styles.statItem}>
                <Text variant="heading3">
                  {books.filter(b => b.status === 'reading').length}
                </Text>
                <Text variant="small" color={theme.colors.textTertiary}>
                  {t('library.reading')}
                </Text>
              </View>
            </View>
          </Card>
        </Animated.View>

        <Animated.View style={[styles.settingsSection, settingsAnim.style]}>
          <Card variant="flat" style={styles.settingsCard}>
            <SettingRow
              label={t('profile.language')}
              value={i18n.language === 'en' ? 'English' : 'Espanol'}
              onPress={handleLanguageToggle}
              theme={theme}
              icon={<Globe size={18} color={theme.colors.textSecondary} />}
            />
            <Divider style={styles.settingDivider} />
            <SettingRow
              label={t('profile.about')}
              value={t('profile.version', { version: '1.0.0' })}
              theme={theme}
              icon={<Info size={18} color={theme.colors.textSecondary} />}
            />
            <Divider style={styles.settingDivider} />
            <SettingRow
              label={t('profile.privacyPolicy')}
              value=""
              onPress={() => router.push('/legal/privacy')}
              theme={theme}
              icon={<Shield size={18} color={theme.colors.textSecondary} />}
            />
            <Divider style={styles.settingDivider} />
            <SettingRow
              label={t('profile.termsOfService')}
              value=""
              onPress={() => router.push('/legal/terms')}
              theme={theme}
              icon={<FileText size={18} color={theme.colors.textSecondary} />}
            />
          </Card>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowSignOutModal(true);
            }}
            style={[styles.actionButton, { borderColor: theme.colors.border }]}
          >
            <LogOut size={18} color={theme.colors.error} />
            <Text variant="bodyMedium" color={theme.colors.error}>
              {t('profile.signOut')}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              setShowDeleteModal(true);
            }}
            style={styles.deleteButton}
          >
            <Trash2 size={16} color={theme.colors.textTertiary} />
            <Text variant="caption" color={theme.colors.textTertiary}>
              {t('profile.deleteAccount')}
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      <AppModal
        visible={showSignOutModal}
        title={t('profile.signOut')}
        message={t('profile.signOutConfirm')}
        onRequestClose={() => {
          if (!isSigningOut) setShowSignOutModal(false);
        }}
        actions={[
          {
            label: t('common.cancel'),
            variant: 'ghost',
            onPress: () => setShowSignOutModal(false),
            disabled: isSigningOut,
          },
          {
            label: t('common.confirm'),
            onPress: () => {
              setShowSignOutModal(false);
              void handleSignOut();
            },
            loading: isSigningOut,
            disabled: isSigningOut,
          },
        ]}
      />

      <AppModal
        visible={showDeleteModal}
        title={t('profile.deleteAccountTitle')}
        message={t('profile.deleteAccountConfirm')}
        onRequestClose={() => {
          if (!isDeleting) setShowDeleteModal(false);
        }}
        actions={[
          {
            label: t('common.cancel'),
            variant: 'ghost',
            onPress: () => setShowDeleteModal(false),
            disabled: isDeleting,
          },
          {
            label: t('common.delete'),
            variant: 'danger',
            onPress: () => {
              setShowDeleteModal(false);
              void handleDeleteAccount();
            },
            loading: isDeleting,
            disabled: isDeleting,
          },
        ]}
      />

      <AppModal
        visible={feedbackModal.visible}
        title={feedbackModal.title}
        message={feedbackModal.message}
        onRequestClose={() => setFeedbackModal({ visible: false, title: '', message: '' })}
        actions={[
          {
            label: 'OK',
            onPress: () => setFeedbackModal({ visible: false, title: '', message: '' }),
          },
        ]}
      />
    </SafeArea>
  );
}

function SettingRow({
  label,
  value,
  onPress,
  theme,
  icon,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  theme: any;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[settingStyles.row, !onPress && { opacity: 0.7 }]}
      disabled={!onPress}
    >
      <View style={settingStyles.leftContent}>
        {icon}
        <Text variant="body">{label}</Text>
      </View>
      <View style={settingStyles.rightContent}>
        {value ? (
          <Text variant="caption" color={theme.colors.textSecondary}>{value}</Text>
        ) : null}
        {onPress && <ChevronRight size={16} color={theme.colors.textTertiary} />}
      </View>
    </Pressable>
  );
}

const settingStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  profileCard: { alignItems: 'center', padding: 24, gap: 4 },
  profileInfo: { alignItems: 'center', gap: 2, marginTop: 8 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  settingsSection: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  settingsCard: { overflow: 'hidden' },
  settingDivider: { marginVertical: 0, marginHorizontal: 16 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
});
