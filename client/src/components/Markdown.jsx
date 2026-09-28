import { Fragment } from 'react';
import { Link } from 'react-router-dom';

// Tiny Markdown renderer for the legal pages (headings, paragraphs, lists, bold, links),
// so docs/PRIVACY_POLICY.md and docs/TERMS_AND_CONDITIONS.md stay the single source of truth.
function inline(text, key = 0) {
  const parts = [];
  const re = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)|`(.+?)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const k = `${key}-${m.index}`;
    if (m[1]) parts.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2]) {
      const href = m[3];
      parts.push(href.startsWith('/') ? <Link key={k} to={href}>{m[2]}</Link> : <a key={k} href={href} rel="noopener noreferrer">{m[2]}</a>);
    } else parts.push(<code key={k}>{m[4]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function Markdown({ source }) {
  const blocks = [];
  let list = null;
  let para = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const h = line.match(/^(#{1,3})\s+(.*?)(?:\s+\{#([\w-]+)\})?$/);
    if (!line) flush();
    else if (h) { flush(); blocks.push({ type: `h${h[1].length}`, text: h[2], id: h[3] || slug(h[2]) }); }
    else if (/^[-*]\s+/.test(line)) {
      if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; }
      list = list || { type: 'ul', items: [] };
      list.items.push(line.replace(/^[-*]\s+/, ''));
    } else if (list) list.items[list.items.length - 1] += ` ${line}`;
    else para.push(line);
  }
  flush();
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'ul') return <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}</ul>;
        if (b.type === 'p') return <p key={i}>{inline(b.text, i)}</p>;
        const Tag = b.type;
        return <Fragment key={i}><Tag id={b.id}>{inline(b.text, i)}</Tag></Fragment>;
      })}
    </>
  );
}
