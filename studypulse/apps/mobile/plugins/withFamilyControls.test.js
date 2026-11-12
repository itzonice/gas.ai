const assert = require("node:assert/strict");
const { test } = require("node:test");

const plugin = require("./withFamilyControls.js");

const { addFamilyControlsEntitlements, raiseDeploymentTarget } = plugin;

test("adds the Family Controls entitlement and App Group, idempotently", () => {
  const once = addFamilyControlsEntitlements({ "aps-environment": "production" }, "group.app.x");
  assert.deepEqual(once, {
    "aps-environment": "production",
    "com.apple.developer.family-controls": true,
    "com.apple.security.application-groups": ["group.app.x"],
  });
  assert.deepEqual(addFamilyControlsEntitlements(once, "group.app.x"), once);
});

test("keeps existing App Groups", () => {
  const result = addFamilyControlsEntitlements(
    { "com.apple.security.application-groups": ["group.other"] },
    "group.app.x",
  );
  assert.deepEqual(result["com.apple.security.application-groups"], ["group.other", "group.app.x"]);
});

test("raises the deployment target to iOS 16 but never lowers it", () => {
  assert.equal(raiseDeploymentTarget({})["ios.deploymentTarget"], "16.0");
  assert.equal(
    raiseDeploymentTarget({ "ios.deploymentTarget": "15.1" })["ios.deploymentTarget"],
    "16.0",
  );
  assert.equal(
    raiseDeploymentTarget({ "ios.deploymentTarget": "17.0" })["ios.deploymentTarget"],
    "17.0",
  );
});

test("does nothing unless enabled (Apple must approve the entitlement first)", () => {
  const previous = process.env.EXPO_FAMILY_CONTROLS;
  delete process.env.EXPO_FAMILY_CONTROLS;
  const config = { name: "x", slug: "x", ios: { bundleIdentifier: "app.x" } };
  assert.deepEqual(plugin(config, {}), config);
  if (previous !== undefined) process.env.EXPO_FAMILY_CONTROLS = previous;
});

test("requires a bundle id or App Group when enabled", () => {
  assert.throws(() => plugin({ name: "x", slug: "x" }, { enabled: true }), /bundleIdentifier/);
});
