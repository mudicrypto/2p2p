/**
 * Release signing for Google Play.
 * Adds a `release` signing config to the generated android/app/build.gradle that reads the upload key
 * from environment variables (set from CI secrets). Without them the release build keeps Expo's
 * default debug signing, which is fine for test APKs but is rejected by Google Play.
 *   ANDROID_UPLOAD_STORE_FILE      absolute path to the upload keystore (.jks)
 *   ANDROID_UPLOAD_STORE_PASSWORD  keystore password
 *   ANDROID_UPLOAD_KEY_ALIAS       key alias
 *   ANDROID_UPLOAD_KEY_PASSWORD    key password
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (System.getenv('ANDROID_UPLOAD_STORE_FILE')) {
                storeFile file(System.getenv('ANDROID_UPLOAD_STORE_FILE'))
                storePassword System.getenv('ANDROID_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('ANDROID_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_UPLOAD_KEY_PASSWORD')
            }
        }`;

function addReleaseSigning(gradle) {
  if (gradle.includes("System.getenv('ANDROID_UPLOAD_STORE_FILE')")) return gradle;
  const withConfig = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${RELEASE_CONFIG}`);
  if (withConfig === gradle) throw new Error('with-release-signing: no signingConfigs block in app/build.gradle');
  // In the release build type, use the upload key when it is configured.
  const release = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;
  if (!release.test(withConfig)) throw new Error('with-release-signing: release build type not found');
  return withConfig.replace(release, "$1signingConfig System.getenv('ANDROID_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug");
}

module.exports = (config) => withAppBuildGradle(config, (c) => { c.modResults.contents = addReleaseSigning(c.modResults.contents); return c; });
module.exports.addReleaseSigning = addReleaseSigning;
