import { useEffect, useRef, useState } from 'react';

// Click-to-edit text. Enter saves, Escape cancels, blank values are rejected.
export default function InlineEdit({ value, label, maxLength, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const input = useRef(null);

  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };

  if (!editing) {
    return (
      <button type="button" className="inline-edit" onClick={() => { setDraft(value); setEditing(true); }} aria-label={`${label}: ${value}. Click to rename`}>
        {value}
      </button>
    );
  }
  return (
    <input
      ref={input}
      className="inline-edit-input"
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      }}
    />
  );
}
