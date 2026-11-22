// Signs release builds with the keystore described in ~/.finsaathi/keystore.properties (kept outside the repo).
const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

// Compile against Android platform 36 (the one present in a default Android Studio install); the Expo default is 37.
const withSdk36 = (config) => withProjectBuildGradle(config, (c) => {
  if (!c.modResults.contents.includes('compileSdkVersion = 36')) {
    c.modResults.contents = c.modResults.contents.replace('apply plugin: "expo-root-project"', 'ext {\n  compileSdkVersion = 36\n  targetSdkVersion = 36\n}\n\napply plugin: "expo-root-project"');
  }
  return c;
});

const withSigning = (config) => withAppBuildGradle(config, (c) => {
  let g = c.modResults.contents;
  if (g.includes('finsaathiRelease')) return c;
  g = g.replace('signingConfigs {', `signingConfigs {
        finsaathiRelease {
            def props = new Properties()
            def f = new File(System.getProperty('user.home'), '.finsaathi/keystore.properties')
            if (f.exists()) {
                f.withInputStream { props.load(it) }
                storeFile file(props['storeFile'])
                storePassword props['storePassword']
                keyAlias props['alias']
                keyPassword props['keyPassword']
            }
        }`);
  const rel = g.indexOf('release {', g.indexOf('buildTypes'));
  const at = g.indexOf('signingConfig signingConfigs.debug', rel);
  if (rel < 0 || at < 0) throw new Error('withReleaseSigning: could not find the release build type');
  g = g.slice(0, at) + 'signingConfig signingConfigs.finsaathiRelease' + g.slice(at + 'signingConfig signingConfigs.debug'.length);
  c.modResults.contents = g;
  return c;
});

module.exports = (config) => withSdk36(withSigning(config));
