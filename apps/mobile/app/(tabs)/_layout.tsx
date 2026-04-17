import React from 'react';
import { Tabs } from 'expo-router';
import { Library, PlusCircle, Search, User } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme';

export default function TabLayout() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.tabBarBorder,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 20,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarLabelStyle: {
          fontFamily: theme.typography.families.medium,
          fontWeight: '500' as const,
          fontSize: 11,
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('library.title'),
          tabBarLabel: t('library.title'),
          tabBarIcon: ({ color }) => <Library size={22} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t('addUrl.title'),
          tabBarLabel: t('addUrl.title'),
          tabBarIcon: ({ color }) => <PlusCircle size={22} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('search.title'),
          tabBarLabel: t('search.title'),
          tabBarIcon: ({ color }) => <Search size={22} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile.title'),
          tabBarLabel: t('profile.title'),
          tabBarIcon: ({ color }) => <User size={22} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="book/[id]"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
