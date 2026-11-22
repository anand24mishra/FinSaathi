// Signs release builds with the keystore described in ~/.finsaathi/keystore.properties (kept outside the repo).
const { withAppBuildGradle } = require('expo/config-plugins');

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

module.exports = withSigning;
