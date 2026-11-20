import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addReleaseSigning } = require('../plugins/with-release-signing.js');

const GRADLE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}`;

describe('release signing plugin', () => {
  it('adds an env-driven release config and uses it only for release builds', () => {
    const out = addReleaseSigning(GRADLE);
    expect(out).toContain("storeFile file(System.getenv('ANDROID_UPLOAD_STORE_FILE'))");
    expect(out).toMatch(/debug \{\s*signingConfig signingConfigs\.debug/);
    expect(out).toContain("signingConfig System.getenv('ANDROID_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug");
  });
  it('is idempotent', () => {
    const once = addReleaseSigning(GRADLE);
    expect(addReleaseSigning(once)).toBe(once);
  });
  it('fails loudly if the generated file changes shape', () => {
    expect(() => addReleaseSigning('android {}')).toThrow(/signingConfigs/);
  });
});
