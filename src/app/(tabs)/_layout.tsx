import React from 'react';
import { Text, View } from 'react-native';
import { Tabs, router } from 'expo-router';

function Emoji({ children }: { children: string }) {
  return <Text style={{ fontSize: 22 }}>{children}</Text>;
}

function PlusIcon() {
  return (
    <View style={{ height: 28, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 30, fontWeight: '500', lineHeight: 30 }}>+</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: '#000' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: { backgroundColor: '#000', borderTopColor: '#222' },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#8e8e93',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Watchlist', tabBarIcon: () => <Emoji>🔖</Emoji> }}
      />
      <Tabs.Screen
        name="trending"
        options={{ title: 'Trending', tabBarIcon: () => <Emoji>🔥</Emoji> }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add Movie',
          tabBarIcon: () => <PlusIcon />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/import');
          },
        }}
      />
      <Tabs.Screen
        name="seen"
        options={{ title: 'Seen', tabBarIcon: () => <Emoji>👁️</Emoji> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: () => <Emoji>⚙️</Emoji> }}
      />
    </Tabs>
  );
}
