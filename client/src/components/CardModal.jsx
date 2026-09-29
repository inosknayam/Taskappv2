import { useEffect, useId, useRef, useState } from 'react';
import { LABELS, validateCard } from '../../../shared/validation.js';
import FormField from './FormField.jsx';
import FormAlert from './FormAlert.jsx';
import { labelName } from './Labels.jsx';

// Card details in a native <dialog>: focus is trapped and Escape closes it.
export default function CardModal({ card, lists, readOnly = false, onClose, onSave, onMove, onDelete }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [values, setValues] = useState(() => ({
    title: card.title, description: card.description, dueDate: card.dueDate || '', labels: card.labels, checklist: card.checklist,
  }));
  const [newItem, setNewItem] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const currentList = lists.find((l) => l.id === card.listId);
  const [moveTo, setMoveTo] = useState({ listId: card.listId, index: currentList.cards.findIndex((c) => c.id === card.id) });

  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => el.close();
  }, []);

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const toggleLabel = (l) => set('labels', values.labels.includes(l) ? values.labels.filter((x) => x !== l) : [...values.labels, l]);

  const save = async (e) => {
    e.preventDefault();
    const v = validateCard(values);
    if (!v.ok) { setErrors(v.errors); return; }
    setSaving(true);
    try {
      await onSave(v.data);
      onClose();
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const targetList = lists.find((l) => l.id === Number(moveTo.listId));
  const positions = targetList.cards.filter((c) => c.id !== card.id).length + 1;

  return (
    // Clicking the backdrop closes the dialog; keyboard users close it with Escape (native <dialog> behaviour).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <dialog ref={dialog} className="card-modal" aria-labelledby={titleId} onClose={onClose}
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
      <form onSubmit={save} noValidate>
        <div className="modal-header">
          <h2 id={titleId}>{readOnly ? 'Card details' : 'Edit card'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="modal-sub">In list <strong>{currentList.title}</strong></p>
        <FormAlert message={formError} />
        {/* Viewers see the same fields, disabled. */}
        <fieldset className="plain-fieldset" disabled={readOnly}>
        <FormField label="Title" name="title" value={values.title} onChange={(e) => set('title', e.target.value)} error={errors.title} maxLength={200} required />
        <FormField as="textarea" label="Description" name="description" rows={5} value={values.description} onChange={(e) => set('description', e.target.value)} error={errors.description} maxLength={5000} />
        <FormField label="Due date" name="dueDate" type="date" value={values.dueDate} onChange={(e) => set('dueDate', e.target.value)} error={errors.dueDate} />

        <fieldset className="label-picker">
          <legend>Labels</legend>
          {LABELS.map((l) => (
            <label key={l} className={`label label-${l} label-toggle`}>
              <input type="checkbox" checked={values.labels.includes(l)} onChange={() => toggleLabel(l)} /> {labelName(l)}
            </label>
          ))}
        </fieldset>

        <fieldset className="checklist">
          <legend>Checklist</legend>
          {values.checklist.length === 0 && <p className="field-hint">No items yet.</p>}
          <ul>
            {values.checklist.map((item, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" checked={item.done} onChange={() => set('checklist', values.checklist.map((it, j) => (j === i ? { ...it, done: !it.done } : it)))} />
                  <span className={item.done ? 'done' : undefined}>{item.text}</span>
                </label>
                <button type="button" className="link-button" onClick={() => set('checklist', values.checklist.filter((_, j) => j !== i))} aria-label={`Remove ${item.text}`}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="inline-row">
            <label htmlFor={`${titleId}-new`} className="visually-hidden">New checklist item</label>
            <input id={`${titleId}-new`} value={newItem} maxLength={200} placeholder="Add an item" onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newItem.trim()) { set('checklist', [...values.checklist, { text: newItem.trim(), done: false }]); setNewItem(''); } } }} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { if (newItem.trim()) { set('checklist', [...values.checklist, { text: newItem.trim(), done: false }]); setNewItem(''); } }}>Add item</button>
          </div>
          {errors.checklist && <p className="field-error">{errors.checklist}</p>}
        </fieldset>
        </fieldset>

        {!readOnly && (
        <fieldset className="move-card">
          <legend>Move card</legend>
          <div className="inline-row">
            <label>List
              <select value={moveTo.listId} onChange={(e) => setMoveTo({ listId: Number(e.target.value), index: 0 })}>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </label>
            <label>Position
              <select value={moveTo.index} onChange={(e) => setMoveTo((m) => ({ ...m, index: Number(e.target.value) }))}>
                {Array.from({ length: positions }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMove(Number(moveTo.listId), moveTo.index)}>Move</button>
          </div>
        </fieldset>
        )}

        {!readOnly && (
        <div className="modal-actions">
          <button type="button" className="btn btn-danger" onClick={() => { if (window.confirm('Delete this card?')) onDelete(); }}>Delete card</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
        )}
      </form>
    </dialog>
  );
}
