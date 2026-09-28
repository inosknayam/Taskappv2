import { getConsent } from './consent.js';

// Plausible Analytics (cookieless, EU-hosted). It only loads after the visitor accepts
// analytics in the cookie banner, and only if VITE_PUBLIC_PLAUSIBLE_DOMAIN is set.
const DOMAIN = import.meta.env.VITE_PUBLIC_PLAUSIBLE_DOMAIN;
let loaded = false;

function enabled() {
  return Boolean(DOMAIN) && getConsent() === 'granted';
}

function load() {
  if (loaded || !enabled()) return;
  loaded = true;
  window.plausible = window.plausible || function (...args) { (window.plausible.q = window.plausible.q || []).push(args); };
  const s = document.createElement('script');
  s.defer = true;
  s.dataset.domain = DOMAIN;
  s.src = 'https://plausible.io/js/script.manual.js';
  document.head.appendChild(s);
}

export function trackPageview(path) {
  load();
  if (!enabled()) return;
  window.plausible('pageview', { u: `${location.origin}${path}` });
}

// Key conversion events: Signup, Login, Board Created, Card Created, Contact Sent.
export function trackEvent(name, props) {
  load();
  if (!enabled()) return;
  window.plausible(name, props ? { props } : undefined);
}

window.addEventListener('consentchange', (e) => {
  if (e.detail === 'granted') trackPageview(location.pathname.replace(/\/boards\/\d+/, '/boards/:id'));
});
