import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { close, openHostApp, type InitialProps } from "expo-share-extension";

/**
 * The iOS share extension's root view. When the user taps "Movie Deck" in a
 * reel's share sheet, iOS hands us the shared URL (or text containing one).
 * We immediately hand it to the main app through our URL scheme
 * (movierecommender://import?sharedUrl=...) and close ourselves — the main
 * app's Add screen picks the link up and runs the normal import flow.
 */
export default function ShareExtension({ url, text }: InitialProps) {
  const link = url || firstUrl(text);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !link) return;
    done.current = true;
    // Hand the link to the main app, then dismiss the extension.
    openHostApp(`import?sharedUrl=${encodeURIComponent(link)}`);
    const t = setTimeout(() => close(), 900);
    return () => clearTimeout(t);
  }, [link]);

  return (
    <View style={styles.root}>
      <Text style={styles.icon} allowFontScaling={false}>🎬</Text>
      <Text style={styles.title} allowFontScaling={false}>Movie Deck</Text>
      {link ? (
        <>
          <ActivityIndicator color="#fff" style={styles.spinner} />
          <Text style={styles.message} allowFontScaling={false}>Saving your reel…</Text>
        </>
      ) : (
        <>
          <Text style={styles.message} allowFontScaling={false}>
            Couldn&apos;t find a link to save in that share.
          </Text>
          <Pressable style={styles.button} onPress={() => close()}>
            <Text style={styles.buttonText} allowFontScaling={false}>Close</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function firstUrl(text?: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/https?:\/\/[^\s)]+/);
  return m ? m[0] : undefined;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  icon: { fontSize: 44 },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 10 },
  spinner: { marginTop: 16 },
  message: { color: "rgba(255,255,255,0.65)", fontSize: 14, marginTop: 12, textAlign: "center" },
  button: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 28,
    marginTop: 16,
  },
  buttonText: { color: "#000", fontSize: 15, fontWeight: "700" },
});
