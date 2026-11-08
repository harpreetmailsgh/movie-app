import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal, Platform, Alert, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../../lib/store';
import { useQueue } from '../../lib/queue';
import { useAuth } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';
import { readShareLog } from '../../lib/shareLog';

// Version always comes from the running update's own manifest (app.json),
// so the About screen can never go stale behind a hardcoded string again.
const APP_VERSION = Constants.expoConfig?.version ?? 'dev';

function AccountSection() {
  const { ready, configured, session, isAnonymous, authMessage, authBusy, signInWithApple, signInWithGoogle, signOut, deleteAccount } = useAuth();
  const { movies, syncState, lastSyncAt } = useStore();
  const { items: queueItems } = useQueue();
  // Whether the anonymous account holds anything worth keeping via the
  // link upgrade (backlog #85): movies the user added, or queued video
  // imports. The first-launch guide seeds (ids starting 'guide-seed-')
  // don't count — a fresh install always carries those five, and losing
  // them loses nothing. When there is nothing to keep, auth signs the
  // anonymous session out first and signs in fresh, so an identity that
  // already belongs to another account can sign in instead of failing
  // to link to the anonymous one.
  const hasLocalData =
    movies.some((m) => !m.id.startsWith('guide-seed-')) || queueItems.length > 0;
  const [appleMsg, setAppleMsg] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const isExpoGo = Constants.appOwnership === 'expo';

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account & data?',
      'This deletes your watchlist, feedback, queued videos and push token from our servers and clears saved movies from this phone. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeleteSuccess(false);
            void deleteAccount().then((result) => {
              if (result === 'deleted') setDeleteSuccess(true);
            });
          },
        },
      ],
    );
  };

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
                ? 'Log in to save and never lose your lists and settings.'
                : `Signed in${session.user.email ? ` as ${session.user.email}` : ''}.`
              : 'Log in to save and never lose your lists and settings.'}
          </Text>
          {authMessage && <Text style={styles.error}>{authMessage}</Text>}
          {deleteSuccess && <Text style={styles.success}>✓ Your account and data were deleted.</Text>}
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
          {Platform.OS === 'ios' && (!session || isAnonymous) && (
            // The native Apple button renders a red "Unimplemented component"
            // box in Expo Go because the native view manager isn't in the Expo
            // Go binary — only render it in real builds. In Expo Go show a
            // black fallback button mirroring the Google button style instead.
            isExpoGo ? (
              <>
                <Pressable
                  style={[styles.googleBtn, authBusy && styles.authBtnDisabled]}
                  onPress={() => setAppleMsg(true)}
                  disabled={authBusy}
                >
                  <FontAwesome name="apple" size={18} color="#fff" style={styles.googleIcon} />
                  <Text style={styles.googleBtnText}>Sign in with Apple</Text>
                </Pressable>
                {appleMsg && (
                  <Text style={styles.dim}>Apple sign-in isn&rsquo;t available in Expo Go.</Text>
                )}
              </>
            ) : (
              // The native Apple button has no disabled prop, so the
              // wrapper blocks taps while a sign-in is running (backlog
              // #86 — one sign-in at a time); the button itself dims.
              <View pointerEvents={authBusy ? 'none' : 'auto'}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={12}
                  style={[styles.appleBtn, authBusy && styles.authBtnDisabled]}
                  onPress={() => {
                    setDeleteSuccess(false);
                    signInWithApple({ hasLocalData });
                  }}
                />
              </View>
            )
          )}
          {(!session || isAnonymous) && (
            <Pressable
              style={[styles.googleBtn, authBusy && styles.authBtnDisabled]}
              onPress={() => {
                setDeleteSuccess(false);
                signInWithGoogle({ hasLocalData });
              }}
              disabled={authBusy}
            >
              <FontAwesome name="google" size={18} color="#fff" style={styles.googleIcon} />
              <Text style={styles.googleBtnText}>Sign in with Google</Text>
            </Pressable>
          )}
          {session && !isAnonymous && (
            <Pressable
              style={[styles.googleBtn, authBusy && styles.authBtnDisabled]}
              onPress={signOut}
              disabled={authBusy}
            >
              <Text style={styles.googleBtnText}>Log out</Text>
            </Pressable>
          )}
          {session && (
            <Pressable
              style={[styles.secondaryBtn, authBusy && styles.authBtnDisabled]}
              onPress={confirmDeleteAccount}
              disabled={authBusy}
            >
              <Text style={styles.dangerText}>Delete account &amp; data</Text>
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { clearWatchlist, clearSeen, replayGuide } = useStore();
  const insets = useSafeAreaInsets();

  // Share-extension diagnostics: read the on-phone extension log and
  // open the share sheet so it can be copied or sent. Empty in Expo Go
  // (the native module isn't in the binary) — readShareLog returns ''.
  const showShareLog = async () => {
    const log = await readShareLog();
    if (!log) {
      Alert.alert('Share-extension log is empty.');
      return;
    }
    try {
      await Share.share({ message: log });
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  };

  const confirmClear = (which: 'watchlist' | 'seen') => {
    const isWatchlist = which === 'watchlist';
    Alert.alert(
      isWatchlist ? 'Clear Watchlist?' : 'Clear Seen?',
      isWatchlist
        ? 'This removes every movie in your Watch List. This can’t be undone.'
        : 'This removes every movie in your Seen list. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => (isWatchlist ? clearWatchlist() : clearSeen()),
        },
      ],
    );
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
      <Text style={styles.pageHeader}>Settings</Text>

      <AccountSection />

      <View style={[styles.accountBox, styles.section]}>
        <Text style={styles.heading}>Library</Text>
        <View style={styles.clearRow}>
          <Pressable style={[styles.feedbackRow, styles.clearBtn]} onPress={() => confirmClear('watchlist')}>
            <Text style={styles.dangerText}>Clear Watchlist</Text>
          </Pressable>
          <Pressable style={[styles.feedbackRow, styles.clearBtn]} onPress={() => confirmClear('seen')}>
            <Text style={styles.dangerText}>Clear Seen list</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.accountBox, styles.section]}>
        <Text style={styles.heading}>Guide</Text>
        <Pressable
          style={styles.feedbackRow}
          onPress={() => {
            replayGuide();
            Alert.alert('Guide enabled. Go to watchlist and trending to see guide.');
          }}
        >
          <Text style={styles.feedbackText}>Replay guide</Text>
        </Pressable>
      </View>

      <View style={[styles.accountBox, styles.section]}>
        <Text style={styles.heading}>About</Text>
        <Text style={styles.body}>Movie Deck v{APP_VERSION}</Text>
        <Text style={styles.buildStamp} selectable>
          Build {Updates.updateId ? Updates.updateId.slice(0, 8) : 'dev'}
          {Updates.createdAt ? ` · ${new Date(Updates.createdAt).toLocaleString()}` : ''}
        </Text>
      </View>

      <View style={[styles.accountBox, styles.section]}>
        <Text style={styles.heading}>Diagnostics</Text>
        <Pressable style={styles.feedbackRow} onPress={() => { void showShareLog(); }}>
          <Text style={styles.feedbackText}>Share-extension log</Text>
        </Pressable>
      </View>

      <View style={[styles.accountBox, styles.section]}>
        <Text style={styles.heading}>Support</Text>
        <Pressable style={styles.feedbackRow} onPress={() => setFeedbackOpen(true)}>
          <Text style={styles.feedbackText}>Send feedback</Text>
        </Pressable>
        <Pressable style={styles.feedbackRow} onPress={() => router.push('/privacy')}>
          <Text style={styles.feedbackText}>Read Privacy Policy</Text>
        </Pressable>
      </View>

      <FeedbackModal visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 40 },
  pageHeader: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  heading: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 6 },
  section: { marginTop: 16 },
  body: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 21, marginBottom: 10 },
  buildStamp: {
    color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 4,
  },
  feedbackRow: {
    backgroundColor: '#2c2c2e', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', marginTop: 8,
  },
  clearRow: { flexDirection: 'row', gap: 12 },
  clearBtn: { flex: 1, marginTop: 8 },
  feedbackText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dangerText: { color: '#ff453a', fontSize: 15, fontWeight: '700' },
  accountBox: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  appleBtn: { width: '100%', height: 48, marginTop: 12 },
  authBtnDisabled: { opacity: 0.4 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  googleIcon: { marginRight: 10 },
  googleBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.5)',
    backgroundColor: 'rgba(255,69,58,0.08)',
  },
  secondaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  error: { color: '#ff9f0a', fontSize: 13, marginTop: 8 },
  success: { color: '#30d158', fontSize: 14, fontWeight: '700', marginTop: 8 },
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
