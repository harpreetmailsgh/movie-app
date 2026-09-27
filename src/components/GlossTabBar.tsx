import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ColorValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs/types';

type DescriptorOptions = BottomTabBarProps['descriptors'][string]['options'];
type TabRoute = BottomTabBarProps['state']['routes'][number];

// Matches the stock bottom tab bar's content height (iOS UIKit, non-compact).
const BAR_CONTENT_HEIGHT = 49;
const PILL_HEIGHT = 40;

function getLabel(
  options: DescriptorOptions,
  routeName: string,
  focused: boolean,
  color: ColorValue,
): React.ReactNode {
  const { tabBarLabel, title } = options;
  const fallback = typeof tabBarLabel === 'string' ? tabBarLabel : (title ?? routeName);
  if (typeof tabBarLabel === 'function') {
    return tabBarLabel({ focused, color, position: 'below-icon', children: fallback });
  }
  return fallback;
}

/**
 * Custom tab bar for the (tabs) navigator: replicates the stock look exactly
 * (black bar, #222 top border, emoji icons, labels) and adds a static glossy
 * glass pill behind the focused tab that springs to the newly selected tab.
 * The pill has no looping animation — it just sits there, glossy.
 */
export default function GlossTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});

  const [pillX] = useState(() => new Animated.Value(0));
  const [pillOpacity] = useState(() => new Animated.Value(0));

  // Effect-only mutable flags: never read during render.
  const fadeStartedRef = useRef(false);
  const lastRealKeyRef = useRef<string | null>(null);

  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key].options;
  const activeTintColor = focusedOptions.tabBarActiveTintColor ?? '#fff';
  const inactiveTintColor = focusedOptions.tabBarInactiveTintColor ?? '#8e8e93';

  // Pill is a fixed 60pt wide — just enough to hug the tab button's
  // icon+label content. 0 until the focused tab is measured, keeping the
  // pill hidden on cold start.
  const focusedLayout = layouts[focusedRoute.key];
  const pillWidth = focusedLayout ? 60 : 0;

  const pillCenterX = (key: string): number | null => {
    const layout = layouts[key];
    return layout ? layout.x + layout.width / 2 : null;
  };

  // Tab change: spring the pill to the newly selected tab (movement, not a
  // blink). Cold start places it immediately once measured.
  useEffect(() => {
    const route = focusedRoute;
    if (route.name !== 'add') {
      lastRealKeyRef.current = route.key;
    }
    // 'add' never becomes focused (its tabPress is prevented and it pushes
    // /import instead). If it ever did, keep the pill on the last real tab.
    const key =
      route.name === 'add' && lastRealKeyRef.current ? lastRealKeyRef.current : route.key;
    const centerX = pillCenterX(key);
    if (centerX == null) return;
    if (fadeStartedRef.current) {
      Animated.spring(pillX, {
        toValue: centerX,
        stiffness: 300,
        damping: 30,
        useNativeDriver: true,
      }).start();
    } else {
      pillX.setValue(centerX);
    }
    // This effect is keyed on focus change only; layouts come from this
    // render's closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedRoute.key]);

  // First measurement or re-measurement (rotation): snap the pill, never
  // animate, so it stays behind the selected tab.
  useEffect(() => {
    const centerX = pillCenterX(focusedRoute.key);
    if (centerX == null) return;
    if (!fadeStartedRef.current) {
      fadeStartedRef.current = true;
      Animated.timing(pillOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
    pillX.setValue(centerX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts]);

  const handleItemLayout = (key: string) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const existing = prev[key];
      if (
        existing &&
        Math.abs(existing.x - x) < 0.5 &&
        Math.abs(existing.width - width) < 0.5
      ) {
        return prev;
      }
      return { ...prev, [key]: { x, width } };
    });
  };

  const handlePress = (route: TabRoute, focused: boolean) => {
    // Same contract as the stock tab bar: screen listeners (e.g. the 'add'
    // tab's tabPress -> router.push('/import')) can prevent the default.
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) {
      navigation.dispatch({
        type: 'NAVIGATE',
        payload: { name: route.name, params: route.params },
        target: state.key,
      });
    }
  };

  return (
    <View
      style={[
        styles.bar,
        {
          height: BAR_CONTENT_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingHorizontal: Math.max(insets.left, insets.right),
        },
      ]}
    >
      <View style={styles.row}>
        {/* Gloss pill: hidden (opacity 0) until the focused tab is measured. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            {
              width: pillWidth,
              opacity: pillOpacity,
              marginLeft: -pillWidth / 2,
              transform: [{ translateX: pillX }],
            },
          ]}
        >
          {/* Diagonal frosted-glass sheen — strengthened so the pill pops
              against the black bar. Static: no animation. */}
          <LinearGradient
            colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.06)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = index === state.index;
          const color = focused ? activeTintColor : inactiveTintColor;
          const label = getLabel(options, route.name, focused, color);
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={
                options.tabBarAccessibilityLabel ??
                (typeof label === 'string'
                  ? `${label}, tab, ${index + 1} of ${state.routes.length}`
                  : undefined)
              }
              onPress={() => handlePress(route, focused)}
              onLayout={handleItemLayout(route.key)}
              style={styles.item}
            >
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              <Text style={[styles.label, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#000',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#222',
    elevation: 8,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 5,
  },
  label: {
    fontSize: 10,
  },
  pill: {
    position: 'absolute',
    left: 0,
    top: (BAR_CONTENT_HEIGHT - PILL_HEIGHT) / 2,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    overflow: 'hidden',
  },
});
