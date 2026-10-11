/* global __dirname */
/**
 * Adds an Android share target (ACTION_SEND / text/plain) that hands shared URLs
 * to the app through the same deep link the iOS share extension uses:
 *   movierecommender://import?sharedUrl=<url>
 *
 * Additive-only: appends one ShareActivity to the manifest's application element
 * and copies one Java source file during prebuild. Touches nothing else.
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ACTIVITY_NAME = '.ShareActivity';

function addShareActivityToManifest(androidManifest) {
  const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  const activities = mainApplication.activity || [];
  // Idempotent: drop any previous entry before re-adding (prebuild can re-run).
  mainApplication.activity = activities.filter(
    (activity) => !(activity.$ && activity.$['android:name'] === ACTIVITY_NAME)
  );
  mainApplication.activity.push({
    $: {
      'android:name': ACTIVITY_NAME,
      'android:exported': 'true',
      'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      },
    ],
  });
  return androidManifest;
}

function copyShareActivitySource(projectRoot, packageName) {
  const javaDir = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    ...packageName.split('.')
  );
  const template = fs.readFileSync(path.join(__dirname, 'android', 'ShareActivity.java'), 'utf8');
  fs.mkdirSync(javaDir, { recursive: true });
  fs.writeFileSync(
    path.join(javaDir, 'ShareActivity.java'),
    template.replace(/__PACKAGE_NAME__/g, packageName)
  );
}

const withAndroidShareTarget = (config) => {
  config = withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = addShareActivityToManifest(modConfig.modResults);
    return modConfig;
  });
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const packageName = modConfig.android && modConfig.android.package;
      if (!packageName) {
        throw new Error(
          '[withAndroidShareTarget] expo.android.package is required to place ShareActivity.java'
        );
      }
      copyShareActivitySource(modConfig.modRequest.projectRoot, packageName);
      return modConfig;
    },
  ]);
  return config;
};

module.exports = withAndroidShareTarget;
