// Native Google sign-in (Android build). The module is native code, so it is absent in Expo Go and on web: everything here degrades
// to "not available" and the Google button is simply hidden there. The web client ID is public (it is not a secret).
import { Platform } from 'react-native';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '1021725772672-4qf75s4qj91bt1u0iqvi5lj5dmr94hiq.apps.googleusercontent.com';

type Mod = typeof import('@react-native-google-signin/google-signin');
let mod: Mod | null | undefined;
function load(): Mod | null {
  if (mod !== undefined) return mod;
  if (Platform.OS !== 'android') return (mod = null);
  try {
    const m = require('@react-native-google-signin/google-signin') as Mod;
    m.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
    mod = m;
  } catch { mod = null; }
  return mod;
}

export const googleAvailable = (): boolean => load() !== null;

export class GoogleCancelled extends Error {}

/** Opens the Google account picker and resolves with an ID token for our backend. Throws GoogleCancelled if the user backs out. */
export async function getGoogleIdToken(): Promise<string> {
  const m = load();
  if (!m) throw new Error('Google sign-in is not available in this build.');
  await m.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  try { await m.GoogleSignin.signOut(); } catch { /* make sure the account picker is shown */ }
  const res = await m.GoogleSignin.signIn();
  if (res.type !== 'success') throw new GoogleCancelled();
  const token = res.data.idToken;
  if (!token) throw new Error('Google did not return an ID token.');
  return token;
}
