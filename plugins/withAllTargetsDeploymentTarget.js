/**
 * Sets IPHONEOS_DEPLOYMENT_TARGET on every native target (app + extensions),
 * not just the main app target. Expo's built-in withDeploymentTarget only
 * touches the first native target, which leaves the share extension behind
 * and breaks the build when a pod requires a higher minimum version.
 */
const { withXcodeProject } = require("@expo/config-plugins");

const DEPLOYMENT_TARGET = "16.4";

module.exports = function withAllTargetsDeploymentTarget(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const targets = project.pbxNativeTargetSection();
    for (const key of Object.keys(targets)) {
      const target = targets[key];
      if (!target || !target.buildConfigurationList) continue;
      const configList = project.pbxXCConfigurationList()[target.buildConfigurationList];
      if (!configList) continue;
      for (const buildConfigId of configList.buildConfigurations) {
        const buildConfig = project.pbxXCBuildConfigurationSection()[buildConfigId.value];
        if (buildConfig && buildConfig.buildSettings) {
          buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
        }
      }
    }
    return config;
  });
};
