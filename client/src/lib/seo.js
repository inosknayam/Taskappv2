import { useEffect } from 'react';

const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL || '').replace(/\/$/, '');
const SITE_NAME = 'TaskApp';

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

// Sets a unique <title>, meta description, canonical URL and social tags for each page.
export function useSeo({ title, description, path, noindex = false }) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} – Simple Kanban boards for getting things done`;
    const url = `${SITE_URL || location.origin}${path ?? location.pathname}`;
    document.title = fullTitle;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }, [title, description, path, noindex]);
}
