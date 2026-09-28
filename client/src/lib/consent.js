// Stores the visitor's cookie choice in a first-party cookie ("granted" or "denied").
const COOKIE = 'taskapp_consent';
const MAX_AGE = 60 * 60 * 24 * 180; // ask again after ~6 months

export function getConsent() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=(granted|denied)`));
  return match ? match[1] : null;
}

export function setConsent(value) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${value}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent('consentchange', { detail: value }));
}

export function resetConsent() {
  document.cookie = `${COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent('consentchange', { detail: null }));
}
