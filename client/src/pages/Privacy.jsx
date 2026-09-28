import { useEffect } from 'react';
import Markdown from '../components/Markdown.jsx';
import source from '../../../docs/PRIVACY_POLICY.md?raw';
import { useSeo } from '../lib/seo.js';

export default function Privacy() {
  useSeo({ title: 'Privacy Policy', description: 'How TaskApp collects, uses and protects your personal data, and the cookies we use.', path: '/privacy' });
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, []);
  return <article className="container narrow prose"><Markdown source={source} /></article>;
}
