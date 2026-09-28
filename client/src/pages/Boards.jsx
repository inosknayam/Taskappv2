import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BOARD_COLORS, validateBoard } from '../../../shared/validation.js';
import FormField from '../components/FormField.jsx';
import FormAlert from '../components/FormAlert.jsx';
import { api } from '../lib/api.js';
import { useFormState } from '../lib/useFormState.js';
import { useSeo } from '../lib/seo.js';
import { useAuth } from '../lib/auth.jsx';
import { trackEvent } from '../lib/analytics.js';

const COLOR_NAMES = { '#1d4ed8': 'Blue', '#047857': 'Green', '#b91c1c': 'Red', '#6d28d9': 'Purple', '#b45309': 'Amber', '#334155': 'Slate' };

export default function Boards() {
  useSeo({ title: 'Your boards', description: 'All of your TaskApp boards.', noindex: true });
  const { user, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState(null);
  const [loadError, setLoadError] = useState('');
  const f = useFormState({ title: '', color: BOARD_COLORS[0] }, validateBoard);

  useEffect(() => {
    api('/boards').then((d) => setBoards(d.boards)).catch((e) => setLoadError(e.message));
  }, []);

  const onCreate = f.submit(async ({ title, color }) => {
    const { board } = await api('/boards', { method: 'POST', body: { title, color } });
    trackEvent('Board Created');
    navigate(`/boards/${board.id}`);
  });

  const onDeleteAccount = async () => {
    if (!window.confirm('Delete your account and all of your boards? This cannot be undone.')) return;
    await deleteAccount();
    navigate('/');
  };

  return (
    <div className="container">
      <h1>Hi {user.name}, here are your boards</h1>
      <section className="card-surface create-board" aria-labelledby="create-board-title">
        <h2 id="create-board-title">Create a board</h2>
        <form onSubmit={onCreate} noValidate className="create-board-form">
          <FormAlert message={f.formError} />
          <FormField label="Board title" name="title" value={f.values.title} onChange={f.onChange} error={f.errors.title} maxLength={100} placeholder="e.g. Website launch" />
          <fieldset className="color-picker">
            <legend>Colour</legend>
            {BOARD_COLORS.map((c) => (
              <label key={c} className="color-swatch" style={{ '--swatch': c }}>
                <input type="radio" name="color" value={c} checked={f.values.color === c} onChange={f.onChange} />
                <span className="visually-hidden">{COLOR_NAMES[c]}</span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className="btn btn-primary" disabled={f.submitting}>Create board</button>
        </form>
      </section>

      <h2>Your boards</h2>
      {loadError && <FormAlert message={loadError} />}
      {!boards && !loadError && <p role="status">Loading boards…</p>}
      {boards?.length === 0 && <p>You don&apos;t have any boards yet. Create your first one above.</p>}
      {boards?.length > 0 && (
        <ul className="board-grid">
          {boards.map((b) => (
            <li key={b.id}>
              <Link to={`/boards/${b.id}`} className="board-tile" style={{ background: b.color }}>
                <span className="board-tile-title">{b.title}</span>
                <span className="board-tile-meta">{b.cardCount} {b.cardCount === 1 ? 'card' : 'cards'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="danger-zone">
        <button type="button" className="link-button danger" onClick={onDeleteAccount}>Delete my account</button>
      </p>
    </div>
  );
}
