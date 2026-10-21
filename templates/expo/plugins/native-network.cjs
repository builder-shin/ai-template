const { withAndroidManifest, withInfoPlist } = require("expo/config-plugins");
function configureAndroidNetwork(manifest, configuration) {
  const applications = manifest.manifest.application;
  if (!applications?.length) throw new Error("Native Android manifest has no application.");
  for (const application of applications) {
    application.$ ??= {};
    application.$["android:usesCleartextTraffic"] = String(configuration === "debug");
    if (configuration !== "debug") delete application.$["android:networkSecurityConfig"];
  }
  return manifest;
}
function configureIosNetwork(plist, configuration) {
  plist.NSAppTransportSecurity = {
    NSAllowsArbitraryLoads: configuration === "debug",
    NSAllowsLocalNetworking: configuration === "debug",
  };
  return plist;
}
function withNativeNetwork(config) {
  const configuration = process.env.NATIVE_BUILD_CONFIGURATION ?? "release";
  if (!["debug", "release"].includes(configuration))
    throw new Error("Invalid native network build configuration.");
  config = withAndroidManifest(config, (result) => {
    result.modResults = configureAndroidNetwork(result.modResults, configuration);
    return result;
  });
  return withInfoPlist(config, (result) => {
    result.modResults = configureIosNetwork(result.modResults, configuration);
    return result;
  });
}
module.exports = withNativeNetwork;
module.exports.configureAndroidNetwork = configureAndroidNetwork;
module.exports.configureIosNetwork = configureIosNetwork;
