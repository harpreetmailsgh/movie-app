import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';

const POINTS = [
  {
    icon: '🎬',
    title: 'What we save',
    detail: 'The movies you add and your settings — on this phone, and backed up to the cloud so you don’t lose your list.',
  },
  {
    icon: '🔓',
    title: 'No login required',
    detail: 'The app works without an account. Signing in is optional, only in Settings, and only helps restore your list on a new phone.',
  },
  {
    icon: '🛡️',
    title: 'What we don’t do',
    detail: 'No selling your data. No ads, no ad tracking, no marketing emails.',
  },
  {
    icon: '🌍',
    title: 'Country, not location',
    detail: 'We look up your country from your internet connection, at most once a week, for the right Trending list. No GPS.',
  },
  {
    icon: '🔧',
    title: 'Fixing failed lookups',
    detail: 'If a movie search fails because the app’s key isn’t accepted, we send only the service name, error code and app version — once per service and error each time you open the app — so we can fix it.',
  },
  {
    icon: '💬',
    title: 'Feedback is stored',
    detail: 'Feedback you send is stored on our servers with the app version and the date, and your account ID if you are signed in.',
  },
  {
    icon: '🔔',
    title: 'Notifications via Expo',
    detail: 'Your push token goes to Expo’s servers, which deliver processing and Trending notifications.',
  },
  {
    icon: '🗑️',
    title: 'Delete anytime',
    detail: 'Settings → Delete account & data removes your list, feedback, queue and push token from our servers.',
  },
];

export default function PrivacySheet({
  visible,
  onContinue,
  onReadPolicy,
}: {
  visible: boolean;
  onContinue: () => void;
  onReadPolicy: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>Your privacy</Text>
          <Text style={styles.sub}>Save My Movie is built to save movies, not to collect data about you. Here’s the short version:</Text>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {POINTS.map((p) => (
              <View key={p.title} style={styles.row}>
                <View style={styles.badge}>
                  <Text style={styles.badgeIcon}>{p.icon}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{p.title}</Text>
                  <Text style={styles.rowDetail}>{p.detail}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.button} onPress={onContinue}>
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={onReadPolicy} hitSlop={8}>
            <Text style={styles.linkText}>Read the full Privacy Policy</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  sheet: { width: '100%', maxWidth: 380, maxHeight: '92%' },
  scroll: { flexGrow: 1, flexShrink: 1 },
  heading: { color: '#fff', fontSize: 32, fontWeight: '800', textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  badgeIcon: { fontSize: 20 },
  rowText: { marginLeft: 14, flex: 1 },
  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rowDetail: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2, lineHeight: 18 },
  button: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonText: { color: '#000', fontSize: 17, fontWeight: '700' },
  linkBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 4 },
  linkText: { color: '#0a84ff', fontSize: 15, fontWeight: '600' },
});
