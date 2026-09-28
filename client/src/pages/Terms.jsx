import Markdown from '../components/Markdown.jsx';
import source from '../../../docs/TERMS_AND_CONDITIONS.md?raw';
import { useSeo } from '../lib/seo.js';

export default function Terms() {
  useSeo({ title: 'Terms & Conditions', description: 'The terms that apply when you use TaskApp.', path: '/terms' });
  return <article className="container narrow prose"><Markdown source={source} /></article>;
}
