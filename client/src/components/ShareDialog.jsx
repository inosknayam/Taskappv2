import { useEffect, useId, useRef, useState } from 'react';
import { validateShare } from '../../../shared/validation.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import FormField from './FormField.jsx';
import FormAlert from './FormAlert.jsx';

const ROLE_LABEL = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

// Shows who has access. The owner can add people by email, change roles and remove people;
// everyone else can leave the board.
export default function ShareDialog({ board, onClose, onLeft, onMembersChange }) {
  const dialog = useRef(null);
  const titleId = useId();
  const { user } = useAuth();
  const isOwner = board.role === 'owner';
  const [members, setMembers] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => el.close();
  }, []);

  useEffect(() => {
    api(`/boards/${board.id}/members`).then((d) => setMembers(d.members)).catch((e) => setError(e.message));
  }, [board.id]);

  const update = (list) => {
    setMembers(list);
    onMembersChange(list.length - 1);
  };

  const run = async (fn) => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErrors(e.fields || {});
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const share = (e) => {
    e.preventDefault();
    const v = validateShare({ email, role });
    if (!v.ok) { setErrors(v.errors); return; }
    run(async () => {
      const d = await api(`/boards/${board.id}/members`, { method: 'POST', body: v.data });
      update(d.members);
      setEmail('');
      setErrors({});
      setMessage(`Shared with ${v.data.email}. They've been emailed a link.`);
    });
  };

  const changeRole = (member, newRole) => run(async () => {
    const d = await api(`/boards/${board.id}/members/${member.id}`, { method: 'PATCH', body: { role: newRole } });
    update(d.members);
  });

  const remove = (member) => {
    const self = member.id === user.id;
    if (!window.confirm(self ? `Leave "${board.title}"? You'll lose access to it.` : `Remove ${member.name} from this board?`)) return;
    run(async () => {
      await api(`/boards/${board.id}/members/${member.id}`, { method: 'DELETE' });
      if (self) onLeft();
      else update(members.filter((m) => m.id !== member.id));
    });
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- backdrop click; Escape closes natively
    <dialog ref={dialog} className="card-modal" aria-labelledby={titleId} onClose={onClose}
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
      <div className="dialog-body">
        <div className="modal-header">
          <h2 id={titleId}>Share &ldquo;{board.title}&rdquo;</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <FormAlert message={error} />
        {message && <p className="form-success" role="status">{message}</p>}

        {isOwner && (
          <form onSubmit={share} noValidate className="share-form">
            <FormField label="Email address" name="email" type="email" autoComplete="off" value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors({}); }} error={errors.email}
              hint="They need a TaskApp account with this email." />
            <div className="field">
              <label htmlFor={`${titleId}-role`}>Permission</label>
              <select id={`${titleId}-role`} value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="editor">Editor: can add, edit and move cards and lists</option>
                <option value="viewer">Viewer: can only look</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>Share</button>
          </form>
        )}

        <h3 className="members-title">People with access</h3>
        {!members ? <p role="status">Loading…</p> : (
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.id}>
                <span className="member-name">
                  <strong>{m.name}{m.id === user.id ? ' (you)' : ''}</strong>
                  <span className="member-email">{m.email}</span>
                </span>
                <span className="member-actions">
                  {isOwner && m.role !== 'owner' ? (
                    <>
                      <label className="visually-hidden" htmlFor={`${titleId}-m${m.id}`}>Permission for {m.name}</label>
                      <select id={`${titleId}-m${m.id}`} value={m.role} disabled={busy} onChange={(e) => changeRole(m, e.target.value)}>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button type="button" className="link-button danger" disabled={busy} onClick={() => remove(m)}>Remove</button>
                    </>
                  ) : (
                    <span className="member-role">{ROLE_LABEL[m.role]}</span>
                  )}
                  {!isOwner && m.id === user.id && (
                    <button type="button" className="link-button danger" disabled={busy} onClick={() => remove(m)}>Leave board</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
