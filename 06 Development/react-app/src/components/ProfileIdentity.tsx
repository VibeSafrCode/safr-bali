import { YOGA_MINI_APP } from "../runtime/yoga-mini-app";
import { useState } from 'react';
import { requireClientUiBindings, type ClientUiBindings } from '../i18n/client-ui-bindings';
import './profile-layout.css';

type Props = { locale: 'ru' | 'en'; ui?: ClientUiBindings; username?: string | null; firstName?: string | null; referralLink?: string | null; copied: boolean; onCopy: () => Promise<void> };
export function ProfileIdentity({ locale, ui, username, firstName, referralLink, copied, onCopy }: Props) {
  const clientUi = YOGA_MINI_APP || ui === undefined ? undefined : requireClientUiBindings(ui);
  const en = locale === 'en';
  const copy = {
    signIn: clientUi ? clientUi.text('inline:06 Development/react-app/src/components/ProfileIdentity.tsx#aa07eaf646cf') : (en ? 'Sign-in · Telegram' : 'Авторизация · Telegram'),
    account: clientUi ? clientUi.text('inline:06 Development/react-app/src/components/ProfileIdentity.tsx#2fb9b8587b32') : (en ? 'Telegram account' : 'Аккаунт Telegram'),
    referral: clientUi ? clientUi.text('inline:06 Development/react-app/src/components/ProfileIdentity.tsx#a7def16423f1') : (en ? 'Your referral link' : 'Твоя реферальная ссылка'),
    unavailable: clientUi ? clientUi.text('inline:06 Development/react-app/src/components/ProfileIdentity.tsx#680536c8f97e') : (en ? 'Link is not available yet' : 'Ссылка пока недоступна'),
    copyLabel: clientUi ? clientUi.text('inline:06 Development/react-app/src/components/ProfileIdentity.tsx#aa6e245d18a3') : (en ? 'Copy referral link' : 'Скопировать реферальную ссылку'),
    copied: clientUi ? clientUi.text('inline:06 Development/react-app/src/components/ProfileIdentity.tsx#6ee579abfae4') : (en ? 'Copied' : 'Готово'),
    action: clientUi ? clientUi.text('inline:06 Development/react-app/src/components/ProfileIdentity.tsx#dc9bf0b2ec69') : (en ? 'Copy' : 'Копировать'),
    error: clientUi ? clientUi.text('inline:06 Development/react-app/src/components/ProfileIdentity.tsx#659b181479db') : (en ? 'Select and copy the link manually.' : 'Выдели и скопируй ссылку вручную.'),
    success: clientUi ? clientUi.text('inline:06 Development/react-app/src/components/ProfileIdentity.tsx#a1b96c012ee2') : (en ? 'Link copied' : 'Ссылка скопирована'),
  };
  const [copyError,setCopyError]=useState(false);
  async function copyReferral() {
    setCopyError(false);
    try { await onCopy(); } catch { setCopyError(true); }
  }
  return <div className="profile-card client-profile-identity" lang={clientUi?.locale} dir={clientUi?.dir}>
    <div className="profile-account-row"><span>{copy.signIn}</span><strong>{username ? `@${username}` : firstName || copy.account}</strong></div>
    <div className="profile-referral-row"><span>{copy.referral}</span><div className="profile-referral-value"><span className="profile-link-text">{referralLink || copy.unavailable}</span><button className="button secondary" type="button" disabled={!referralLink} onClick={() => void copyReferral()} aria-label={copy.copyLabel}>{copied ? copy.copied : copy.action}</button></div><small role="status">{copyError ? copy.error : copied ? copy.success : ''}</small></div>
  </div>;
}
