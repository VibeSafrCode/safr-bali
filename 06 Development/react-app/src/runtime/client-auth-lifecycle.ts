import {YOGA_MINI_APP} from './yoga-mini-app';
import {browserUiInitialLocale} from '../i18n/system-ui-locale';
/** UI invalidation only; no principal, credentials or network intent in storage. */
export const CLIENT_UI_LOCALE_STORAGE_KEY = "safr:client-ui-locale:v1";
export const CLIENT_AUTH_LOGOUT_EVENT = "safr:auth-logout";
const LOGOUT_CHANNEL = "safr:client-auth-lifecycle";
// Ephemeral tab marker for event de-duplication, never an actor or auth credential.
const LOGOUT_SENDER = YOGA_MINI_APP?null:Math.random().toString(36).slice(2);

function resetClientUiPreference() {
  try { window.localStorage.removeItem(CLIENT_UI_LOCALE_STORAGE_KEY); }
  catch { /* Logout invalidation must still work when storage is unavailable. */ }
  const {locale}=browserUiInitialLocale();
  document.documentElement.lang = locale;
  document.documentElement.dir = locale==='ar'?'rtl':'ltr';
}

/** Call only after the server has accepted the real logout. */
export function publishClientAuthLogout() {
  resetClientUiPreference();
  window.dispatchEvent(new Event(CLIENT_AUTH_LOGOUT_EVENT));
  try {
    const channel = new BroadcastChannel(LOGOUT_CHANNEL);
    try { channel.postMessage({ type: "logout", sender: LOGOUT_SENDER }); }
    finally { channel.close(); }
  } catch { /* Same-window invalidation does not depend on cross-tab support. */ }
}

/** A logout signal can only clear UI state; it never establishes authentication. */
export function subscribeClientAuthLogout(onLogout: () => void): () => void {
  const invalidate = () => { resetClientUiPreference(); onLogout(); };
  window.addEventListener(CLIENT_AUTH_LOGOUT_EVENT, invalidate);
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(LOGOUT_CHANNEL);
    channel.onmessage = event => {
      const value: unknown = event.data;
      if (value && typeof value === "object" && "type" in value && value.type === "logout" &&
          "sender" in value && typeof value.sender === "string" && value.sender !== LOGOUT_SENDER) {
        invalidate();
      }
    };
  } catch { /* Unsupported/denied channels leave the ordinary event listener. */ }
  return () => {
    window.removeEventListener(CLIENT_AUTH_LOGOUT_EVENT, invalidate);
    channel?.close();
  };
}
