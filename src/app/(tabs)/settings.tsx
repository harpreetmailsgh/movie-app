import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Updates from 'expo-updates';
import { FontAwesome } from '@expo/vector-icons';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';

const APP_VERSION = '1.3.5';

function AccountSection() {
  const { ready, configured, session, isAnonymous, appleAvailable, authMessage, signInWithApple, signOut } = useAuth();
  const { syncState, lastSyncAt } = useStore();
  const [googleMsg, setGoogleMsg] = useState(false);

  return (
    <View style={styles.accountBox}>
      <Text style={styles.heading}>Account</Text>
      {!configured ? (
        <Text style={styles.body}>
          Cloud sync isn't set up yet — your list stays on this phone for now.
        </Text>
      ) : !ready ? (
        <Text style={styles.dim}>Loading…</Text>
      ) : (
        <>
          <Text style={styles.body}>
            {session
              ? isAnonymous
                ? 'Using the app anonymously — your list will follow you once you sign in.'
                : `Signed in${session.user.email ? ` as ${session.user.email}` : ''}.`
              : 'Not signed in.'}
          </Text>
          {authMessage && <Text style={styles.error}>{authMessage}</Text>}
          {configured && session && (
            <Text style={styles.dim}>
              {syncState === 'syncing'
                ? 'Backing up your list…'
                : syncState === 'error'
                  ? 'Backup failed — will retry automatically.'
                  : lastSyncAt
                    ? `List backed up ✓ ${new Date(lastSyncAt).toLocaleString()}`
                    : 'Backup pending…'}
            </Text>
          )}
          {appleAvailable && (!session || isAnonymous) && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={styles.appleBtn}
              onPress={signInWithApple}
            />
          )}
          {(!session || isAnonymous) && (
            <Pressable style={styles.googleBtn} onPress={() => setGoogleMsg(true)}>
              <FontAwesome name="google" size={18} color="#fff" style={styles.googleIcon} />
              <Text style={styles.googleBtnText}>Sign in with Google</Text>
            </Pressable>
          )}
          {googleMsg && (
            <Text style={styles.dim}>Google sign-in is not set up yet.</Text>
          )}
          {session && !isAnonymous && (
            <Pressable style={styles.secondaryBtn} onPress={signOut}>
              <Text style={styles.secondaryBtnText}>Sign out</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

function FeedbackModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<'sent' | 'failed' | null>(null);

  const close = () => {
    setMessage('');
    setStatus(null);
    setSending(false);
    onClose();
  };

  const send = async () => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setStatus(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('no client');
      const { error } = await sb.from('feedback').insert({
        user_id: session?.user?.id ?? null,
        message: trimmed,
        app_version: APP_VERSION,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      setStatus('sent');
      setMessage('');
    } catch {
      setStatus('failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Send feedback</Text>
          <Pressable hitSlop={12} onPress={close}>
            <Text style={styles.modalClose}>Done</Text>
          </Pressable>
        </View>
        {status === 'sent' ? (
          <Text style={styles.modalConfirm}>Thanks — feedback sent ✓</Text>
        ) : (
          <>
            <TextInput
              style={styles.feedbackInput}
              multiline
              placeholder="Tell us what’s working, what’s not…"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={message}
              onChangeText={setMessage}
              editable={!sending}
            />
            {status === 'failed' && (
              <Text style={styles.error}>Couldn’t send feedback — check your connection and try again.</Text>
            )}
            <Pressable
              style={[styles.sendBtn, (!message.trim() || sending) && styles.sendBtnDisabled]}
              onPress={send}
              disabled={!message.trim() || sending}
            >
              <Text style={styles.sendBtnText}>{sending ? 'Sending…' : 'Send'}</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

export default function SettingsScreen() {
  const { addTestMovies } = useStore();
  const [addingTests, setAddingTests] = useState(false);
  const [testsAdded, setTestsAdded] = useState<number | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const addTests = async () => {
    setAddingTests(true);
    setTestsAdded(null);
    try {
      const n = await addTestMovies(20);
      setTestsAdded(n);
    } catch {
      Alert.alert('Couldn’t add movies', 'Check your connection and try again.');
    } finally {
      setAddingTests(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
      <Text style={styles.pageHeader}>Settings</Text>

      <AccountSection />

      <Text style={[styles.heading, styles.section]}>Testing</Text>
      <Text style={styles.body}>
        Fill your Watchlist with 20 well-known sample movies — handy for trying out the swipe deck.
      </Text>
      <Pressable style={styles.hapticTest} onPress={addTests} disabled={addingTests}>
        <Text style={styles.hapticTestText}>
          {addingTests ? 'Adding…' : testsAdded !== null ? `Added ${testsAdded} movies ✓ — tap to add more` : 'Add 20 sample movies'}
        </Text>
      </Pressable>

      <Text style={[styles.heading, styles.section]}>About</Text>
      <Text style={styles.body}>Movie Recommender v{APP_VERSION}</Text>
      <Text style={styles.buildStamp} selectable>
        Build {Updates.updateId ? Updates.updateId.slice(0, 8) : 'dev'}
        {Updates.createdAt ? ` · ${new Date(Updates.createdAt).toLocaleString()}` : ''}
      </Text>
      <Pressable style={styles.feedbackRow} onPress={() => setFeedbackOpen(true)}>
        <Text style={styles.feedbackText}>Send feedback</Text>
      </Pressable>

      <FeedbackModal visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingBottom: 40 },
  pageHeader: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 12 },
  heading: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  section: { marginTop: 32 },
  body: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 21, marginBottom: 10 },
  hapticTest: {
    backgroundColor: '#1c1c1e', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', marginTop: 12,
  },
  hapticTestText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  buildStamp: {
    color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 8,
  },
  feedbackRow: {
    backgroundColor: '#1c1c1e', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', marginTop: 12,
  },
  feedbackText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  accountBox: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  appleBtn: { width: '100%', height: 48, marginTop: 12 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  googleIcon: { marginRight: 10 },
  googleBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  secondaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  error: { color: '#ff9f0a', fontSize: 13, marginTop: 8 },
  dim: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  modalRoot: { flex: 1, backgroundColor: '#000', padding: 20, paddingTop: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  modalClose: { color: '#0a84ff', fontSize: 16, fontWeight: '700' },
  feedbackInput: {
    backgroundColor: '#1c1c1e', borderRadius: 12, color: '#fff', fontSize: 15,
    padding: 12, minHeight: 140, textAlignVertical: 'top',
  },
  sendBtn: {
    backgroundColor: '#0a84ff', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', marginTop: 16,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalConfirm: { color: '#30d158', fontSize: 16, fontWeight: '700', marginTop: 12 },
});
