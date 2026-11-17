import { StyleSheet, View } from 'react-native';

/**
 * Small grabber pill at the top of a sheet-style screen — a visual cue
 * that the screen can be swiped away. Plain non-tappable View: no
 * onPress, no gesture handling. Hidden from VoiceOver.
 */
export default function SheetGrabber() {
  return <View style={styles.grabber} accessibilityElementsHidden />;
}

const styles = StyleSheet.create({
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignSelf: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
});
