/**
 * Sets IPHONEOS_DEPLOYMENT_TARGET on every native target (app + extensions)
 * AND on the project-level build configurations.
 *
 * Expo's built-in withDeploymentTarget only touches the first native target,
 * which leaves the share extension behind and breaks the build when a pod
 * requires a higher minimum version.
 *
 * Uses withDangerousMod so it runs after all other config plugins.
 */
const { withDangerousMod } = require("@expo/config-plugins");
const xcode = require("xcode");
const path = require("path");
const fs = require("fs");

const DEPLOYMENT_TARGET = "16.4";

module.exports = function withAllTargetsDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const pbxprojPath = path.join(
        config.modRequest.projectRoot,
        "ios",
        "MovieDeck.xcodeproj",
        "project.pbxproj"
      );
      if (!fs.existsSync(pbxprojPath)) {
        console.warn("[withAllTargetsDeploymentTarget] pbxproj not found, skipping");
        return config;
      }
      const project = xcode.project(pbxprojPath);
      project.parseSync();

      let updated = 0;
      // 1. All native targets (app + share extension + any others)
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
            updated++;
          }
        }
      }
      // 2. Project-level build configurations (the fallback default)
      const projSection = project.pbxProjectSection();
      for (const key of Object.keys(projSection)) {
        if (key.endsWith("_comment")) continue;
        const proj = projSection[key];
        const configList = project.pbxXCConfigurationList()[proj.buildConfigurationList];
        if (!configList || !configList.buildConfigurations) continue;
        for (const bc of configList.buildConfigurations) {
          const cfg = project.pbxXCBuildConfigurationSection()[bc.value];
          if (cfg && cfg.buildSettings) {
            cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
            updated++;
          }
        }
      }
      project.writeSync();
      console.log(`[withAllTargetsDeploymentTarget] updated ${updated} build configurations to ${DEPLOYMENT_TARGET}`);
      return config;
    },
  ]);
};
