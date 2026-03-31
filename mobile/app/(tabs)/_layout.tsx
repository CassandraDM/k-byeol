import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { TabBar } from '@/components/ui/tab-bar';

export default function TabLayout() {
  return (
    <>
      <LinearGradient
        colors={['#EDE7FF', '#F2EDFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
        }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="new" />
        <Tabs.Screen name="shop" />
        <Tabs.Screen name="account" />
      </Tabs>
    </>
  );
}
