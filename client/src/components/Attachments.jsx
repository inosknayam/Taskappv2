import { useId, useRef, useState } from 'react';
import { api, uploadFile } from '../lib/api.js';
import FormAlert from './FormAlert.jsx';

const MAX_MB = 10;
const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.docx,.xlsx,.pptx,.zip';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Attachments({ cardId, attachments, readOnly, onChange }) {
  const inputId = useId();
  const input = useRef(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const onFiles = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    setError('');
    let list = attachments;
    for (const file of files) {
      if (file.size > MAX_MB * 1024 * 1024) { setError(`${file.name} is larger than ${MAX_MB} MB.`); continue; }
      setBusy(`Uploading ${file.name}…`);
      try {
        const d = await uploadFile(`/cards/${cardId}/attachments`, file);
        list = [...list, d.attachment];
        onChange(list);
      } catch (err) {
        setError(`${file.name}: ${err.message}`);
      }
    }
    setBusy('');
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete ${a.name}?`)) return;
    setError('');
    try {
      await api(`/attachments/${a.id}`, { method: 'DELETE' });
      onChange(attachments.filter((x) => x.id !== a.id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="attachments" aria-labelledby={`${inputId}-title`}>
      <h3 id={`${inputId}-title`} className="attachments-title">Attachments</h3>
      <FormAlert message={error} />
      {attachments.length === 0 && <p className="field-hint">No attachments yet.</p>}
      <ul className="attachment-list">
        {attachments.map((a) => (
          <li key={a.id}>
            {a.isImage && <img src={`/api/attachments/${a.id}`} alt={`Preview of ${a.name}`} width="56" height="56" loading="lazy" />}
            <span className="attachment-info">
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">{a.name}</a>
              <span className="field-hint">{formatSize(a.size)}</span>
            </span>
            {!readOnly && <button type="button" className="link-button danger" onClick={() => remove(a)} aria-label={`Delete ${a.name}`}>Delete</button>}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="attachment-upload">
          <input ref={input} id={inputId} type="file" multiple accept={ACCEPT} className="visually-hidden" onChange={onFiles} disabled={Boolean(busy)} />
          <label htmlFor={inputId} className="btn btn-secondary btn-sm">Attach files</label>
          <span className="field-hint" role="status">{busy || `Images, PDF, text, CSV, Office or ZIP · up to ${MAX_MB} MB each`}</span>
        </div>
      )}
    </section>
  );
}
