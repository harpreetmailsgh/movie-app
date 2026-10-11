// Typed wrapper around the ExpoShareExtension native module for the
// iOS share-extension diagnostics log. Never throws — any failure (Expo Go
// where the native module isn't in the binary, missing module, bad return)
// degrades to a safe fallback.
import { requireNativeModule } from 'expo-modules-core';
import Constants from 'expo-constants';

type ShareExtensionModule = {
  readShareLog: () => string;
  clearShareLog: () => boolean;
};

// The ExpoShareExtension native module isn't part of the Expo Go binary.
const isExpoGo = Constants.appOwnership === 'expo';

function getModule(): ShareExtensionModule | null {
  if (isExpoGo) return null;
  try {
    return requireNativeModule<ShareExtensionModule>('ExpoShareExtension');
  } catch {
    return null;
  }
}

/** Returns the extension log text, or "" when unavailable (Expo Go, error). */
export async function readShareLog(): Promise<string> {
  try {
    const mod = getModule();
    if (!mod) return '';
    const result = mod.readShareLog();
    return typeof result === 'string' ? result : '';
  } catch {
    return '';
  }
}

/** Clears the extension log. Returns false when unavailable (Expo Go, error). */
export async function clearShareLog(): Promise<boolean> {
  try {
    const mod = getModule();
    if (!mod) return false;
    return mod.clearShareLog() === true;
  } catch {
    return false;
  }
}
