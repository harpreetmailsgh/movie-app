import { requireNativeModule } from 'expo-modules-core';

/** Recognized text lines from a single frame image, in reading order. */
export type RecognizedTextLines = string[];

interface FrameOcrNativeModule {
  recognizeTextAsync(imageUri: string): Promise<string[]>;
}

const NativeFrameOcr = requireNativeModule<FrameOcrNativeModule>('FrameOcr');

/**
 * Runs on-device OCR on a local frame image and returns the recognized
 * text lines in reading order.
 *
 * Never throws: returns an empty array for bad input or whenever
 * recognition fails.
 */
export async function recognizeTextAsync(imageUri: string): Promise<string[]> {
  if (typeof imageUri !== 'string' || imageUri.length === 0) {
    return [];
  }
  try {
    const lines = await NativeFrameOcr.recognizeTextAsync(imageUri);
    if (!Array.isArray(lines)) {
      return [];
    }
    return lines.filter((line): line is string => typeof line === 'string');
  } catch {
    return [];
  }
}
