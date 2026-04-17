import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, View, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { Text } from './Text';
import { Button } from './Button';

interface ModalAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}

interface AppModalProps {
  visible: boolean;
  title: string;
  message?: string;
  actions: ModalAction[];
  onRequestClose?: () => void;
}

export function AppModal({
  visible,
  title,
  message,
  actions,
  onRequestClose,
}: AppModalProps) {
  const theme = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 20,
          stiffness: 300,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.92);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <Text variant="heading3">{title}</Text>
          {message ? (
            <Text variant="body" color={theme.colors.textSecondary} style={styles.message}>
              {message}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {actions.map((action, index) => (
              <Button
                key={`${action.label}-${index}`}
                title={action.label}
                onPress={action.onPress}
                variant={action.variant || 'primary'}
                loading={action.loading}
                disabled={action.disabled}
                style={styles.actionButton}
              />
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 10,
  },
  message: {
    lineHeight: 22,
  },
  actions: {
    marginTop: 8,
    gap: 8,
  },
  actionButton: {
    width: '100%',
  },
});
