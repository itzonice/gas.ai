// Expo config plugin: iOS Family Controls (Screen Time API) for StudyPulse focus blocking.
//
// Adds to the iOS app:
// - com.apple.developer.family-controls: the Family Controls entitlement
// - an App Group shared with the DeviceActivityMonitor extension (targets/)
// - the iOS 16 minimum the individual-authorization API needs
//
// OFF BY DEFAULT. Apple must grant the Family Controls (Distribution) entitlement to the
// team before any build that carries it can be signed for TestFlight or the App Store;
// shipping it early breaks release signing. Request it now (approval can take weeks):
// https://developer.apple.com/contact/request/family-controls-distribution
// Development builds can use the entitlement without approval. Turn it on with the
// `enabled` option or EXPO_FAMILY_CONTROLS=1 (e.g. in an EAS build profile).
const {
  createRunOncePlugin,
  withEntitlementsPlist,
  withPodfileProperties,
} = require("expo/config-plugins");

const FAMILY_CONTROLS = "com.apple.developer.family-controls";
const APP_GROUPS = "com.apple.security.application-groups";
const MIN_IOS = "16.0";

/** Pure: the entitlements with Family Controls and the App Group added (idempotent). */
function addFamilyControlsEntitlements(entitlements, appGroup) {
  const groups = Array.isArray(entitlements[APP_GROUPS]) ? entitlements[APP_GROUPS] : [];
  return {
    ...entitlements,
    [FAMILY_CONTROLS]: true,
    [APP_GROUPS]: groups.includes(appGroup) ? groups : [...groups, appGroup],
  };
}

/** Pure: raises the iOS deployment target to 16.0 unless it is already higher. */
function raiseDeploymentTarget(properties) {
  const current = properties["ios.deploymentTarget"];
  const higher = current && Number.parseFloat(current) >= Number.parseFloat(MIN_IOS);
  return higher ? properties : { ...properties, "ios.deploymentTarget": MIN_IOS };
}

/**
 * @param {import("expo/config-plugins").ExpoConfig} config
 * @param {{ enabled?: boolean, appGroup?: string }} [options]
 */
function withFamilyControls(config, options = {}) {
  const enabled = options.enabled ?? process.env.EXPO_FAMILY_CONTROLS === "1";
  if (!enabled) return config;
  const bundleId = config.ios?.bundleIdentifier;
  const appGroup = options.appGroup ?? (bundleId ? `group.${bundleId}` : undefined);
  if (!appGroup) {
    throw new Error("withFamilyControls: set ios.bundleIdentifier or pass an appGroup option");
  }
  config = withEntitlementsPlist(config, (c) => {
    c.modResults = addFamilyControlsEntitlements(c.modResults, appGroup);
    return c;
  });
  config = withPodfileProperties(config, (c) => {
    c.modResults = raiseDeploymentTarget(c.modResults);
    return c;
  });
  // Read at runtime by src/focus-blocking.ts (and by the extension via the App Group).
  config.extra = { ...config.extra, familyControls: { enabled: true, appGroup } };
  return config;
}

module.exports = createRunOncePlugin(withFamilyControls, "studypulse-family-controls", "1.0.0");
module.exports.addFamilyControlsEntitlements = addFamilyControlsEntitlements;
module.exports.raiseDeploymentTarget = raiseDeploymentTarget;
