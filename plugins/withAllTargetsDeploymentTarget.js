/**
 * Sets IPHONEOS_DEPLOYMENT_TARGET on every native target (app + extensions).
 *
 * Expo's built-in withDeploymentTarget only touches the first native target.
 * The expo-share-extension plugin hard-codes 15.1 for the extension target,
 * which breaks the build when a pod (e.g. ExpoDomWebView) requires 16.4+.
 * This plugin runs after (listed last in app.json) and overrides all targets.
 */
const { withXcodeProject } = require("@expo/config-plugins");

const DEPLOYMENT_TARGET = "16.4";

module.exports = function withAllTargetsDeploymentTarget(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const targets = project.pbxNativeTargetSection();
    for (const key of Object.keys(targets)) {
      if (key.endsWith("_comment")) continue;
      const target = targets[key];
      const configList = project.pbxXCConfigurationList()[target.buildConfigurationList];
      if (!configList || !configList.buildConfigurations) continue;
      for (const bc of configList.buildConfigurations) {
        const cfg = project.pbxXCBuildConfigurationSection()[bc.value];
        if (cfg && cfg.buildSettings) {
          cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
        }
      }
    }
    return config;
  });
};
