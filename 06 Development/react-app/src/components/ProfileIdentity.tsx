import { useState } from 'react';
import './profile-layout.css';

type Props = { locale: 'ru' | 'en'; username?: string | null; firstName?: string | null; referralLink?: string | null; copied: boolean; onCopy: () => Promise<void> };
export function ProfileIdentity({ locale, username, firstName, referralLink, copied, onCopy }: Props) {
  const en = locale === 'en';
  const [copyError,setCopyError]=useState(false);
  async function copy() {
    setCopyError(false);
    try { await onCopy(); } catch { setCopyError(true); }
  }
  return <div className="profile-card client-profile-identity">
    <div className="profile-account-row"><span>{en ? 'Sign-in · Telegram' : 'Авторизация · Telegram'}</span><strong>{username ? `@${username}` : firstName || (en ? 'Telegram account' : 'Аккаунт Telegram')}</strong></div>
    <div className="profile-referral-row"><span>{en ? 'Your referral link' : 'Твоя реферальная ссылка'}</span><div className="profile-referral-value"><span className="profile-link-text">{referralLink || (en ? 'Link is not available yet' : 'Ссылка пока недоступна')}</span><button className="button secondary" type="button" disabled={!referralLink} onClick={() => void copy()} aria-label={en ? 'Copy referral link' : 'Скопировать реферальную ссылку'}>{copied ? (en ? 'Copied' : 'Готово') : (en ? 'Copy' : 'Копировать')}</button></div><small role="status">{copyError ? (en ? 'Select and copy the link manually.' : 'Выдели и скопируй ссылку вручную.') : copied ? (en ? 'Link copied' : 'Ссылка скопирована') : ''}</small></div>
  </div>;
}
