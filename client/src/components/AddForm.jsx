import { useId, useState } from 'react';

// Collapsible "+ Add ..." form used for new lists and cards.
export default function AddForm({ label, placeholder, maxLength, onAdd }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();

  if (!open) return <button type="button" className="add-toggle" onClick={() => setOpen(true)}>+ {label}</button>;

  const submit = async (e) => {
    e.preventDefault();
    const value = title.trim();
    if (!value) { setError('Title is required.'); return; }
    setBusy(true);
    try {
      await onAdd(value);
      setTitle('');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-form" onSubmit={submit} noValidate>
      <label htmlFor={id} className="visually-hidden">{placeholder}</label>
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus follows the user's explicit "Add" click */}
      <input id={id} value={title} placeholder={placeholder} maxLength={maxLength} autoFocus
        aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => { setTitle(e.target.value); setError(''); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} />
      {error && <p id={`${id}-err`} className="field-error">{error}</p>}
      <div className="add-form-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Add</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
      </div>
    </form>
  );
}
