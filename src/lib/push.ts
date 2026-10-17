import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

const TOKEN_KEY = 'movieapp.pushToken.v1';

/** In-memory cache; undefined until the first attempt. */
let cachedToken: string | null | undefined;
let listenersSetUp = false;

export interface QueueIdentity {
  userId: string | null;
  pushToken: string | null;
}

let queueIdentity: QueueIdentity = { userId: null, pushToken: null };

/** Module-level setter consumed by the queue.ts Supabase mirror. */
export function setQueueIdentity(id: QueueIdentity): void {
  queueIdentity = id;
}

/** Read the identity set by setQueueIdentity (defaults to nulls). */
export function getQueueIdentity(): QueueIdentity {
  return queueIdentity;
}

/**
 * Returns the Expo push token, or null when permissions are denied or
 * anything else fails. Never throws, never nags — asks once via
 * requestPermissionsAsync and bows out quietly on denial.
 */
export async function getPushToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    const stored = await AsyncStorage.getItem(TOKEN_KEY);
    if (stored) {
      cachedToken = stored;
      return stored;
    }
    const existing = await Notifications.getPermissionsAsync();
    const status =
      existing.status === 'granted'
        ? 'granted'
        : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') {
      cachedToken = null;
      return null;
    }
    // projectId is undefined in dev builds — pass through as-is.
    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    const value = token?.data ?? null;
    cachedToken = value;
    if (value) await AsyncStorage.setItem(TOKEN_KEY, value);
    return value;
  } catch {
    cachedToken = null;
    return null;
  }
}

/**
 * One-time push setup: foreground handler, Android default channel, and
 * tap-to-open behaviour. Idempotent — safe to call repeatedly.
 */
export function setupPushListeners(): void {
  if (listenersSetUp) return;
  listenersSetUp = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {
      /* channel setup is best-effort */
    });
  }
  // Tap a notification → open the Watchlist tab (the (tabs) group
  // index route is the Watchlist screen).
  Notifications.addNotificationResponseReceivedListener(() => {
    router.replace('/(tabs)');
  });
}
