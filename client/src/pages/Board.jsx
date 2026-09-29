import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSeo } from '../lib/seo.js';
import { trackEvent } from '../lib/analytics.js';
import CardModal from '../components/CardModal.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import FormAlert from '../components/FormAlert.jsx';
import InlineEdit from '../components/InlineEdit.jsx';
import AddForm from '../components/AddForm.jsx';
import { LabelDots, labelName } from '../components/Labels.jsx';

function moveCardLocal(lists, cardId, toListId, index) {
  let card;
  const without = lists.map((l) => ({ ...l, cards: l.cards.filter((c) => (c.id === cardId ? ((card = c), false) : true)) }));
  if (!card) return lists;
  return without.map((l) => (l.id === toListId
    ? { ...l, cards: [...l.cards.slice(0, index), { ...card, listId: toListId }, ...l.cards.slice(index)] }
    : l));
}

function moveListLocal(lists, listId, index) {
  const list = lists.find((l) => l.id === listId);
  const rest = lists.filter((l) => l.id !== listId);
  return [...rest.slice(0, index), list, ...rest.slice(index)];
}

// Index at which to insert, based on the pointer position relative to the other items' midpoints.
function dropIndex(container, selector, draggedId, coord, axis) {
  const items = [...container.querySelectorAll(selector)].filter((el) => el.dataset.id !== String(draggedId));
  return items.filter((el) => {
    const r = el.getBoundingClientRect();
    return axis === 'y' ? coord > r.top + r.height / 2 : coord > r.left + r.width / 2;
  }).length;
}

export default function Board() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [openCardId, setOpenCardId] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [query, setQuery] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const drag = useRef(null);

  useSeo({ title: board?.title || 'Board', description: 'A TaskApp board.', noindex: true });

  const load = useCallback(() => api(`/boards/${boardId}`)
    .then((d) => setBoard(d.board))
    .catch((e) => (e.status === 404 ? setNotFound(true) : setError(e.message))), [boardId]);

  useEffect(() => { load(); }, [load]);

  // Optimistic update with rollback (reload) if the server rejects the change.
  const mutate = async (localUpdate, request) => {
    setError('');
    if (localUpdate) setBoard((b) => ({ ...b, lists: localUpdate(b.lists) }));
    try {
      return await request();
    } catch (e) {
      setError(e.message);
      load();
      return null;
    }
  };

  const setLists = (fn) => setBoard((b) => ({ ...b, lists: fn(b.lists) }));

  const moveCard = (cardId, toListId, index) => {
    const listTitle = board.lists.find((l) => l.id === toListId)?.title;
    setAnnouncement(`Card moved to ${listTitle}, position ${index + 1}.`);
    return mutate((ls) => moveCardLocal(ls, cardId, toListId, index), () => api(`/cards/${cardId}`, { method: 'PATCH', body: { listId: toListId, index } }));
  };

  const moveList = (listId, index) => mutate(
    (ls) => moveListLocal(ls, listId, index),
    () => api(`/lists/${listId}`, { method: 'PATCH', body: { index } }),
  );

  if (notFound) {
    return (
      <div className="container narrow not-found">
        <h1>Board not found</h1>
        <p>This board doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link to="/boards" className="btn btn-primary">Back to your boards</Link>
      </div>
    );
  }
  if (!board) return <div className="container">{error ? <FormAlert message={error} /> : <p role="status">Loading board…</p>}</div>;

  const canEdit = board.role !== 'viewer';
  const isOwner = board.role === 'owner';
  const q = query.trim().toLowerCase();
  const visible = (card) => !q || card.title.toLowerCase().includes(q) || card.labels.some((l) => labelName(l).toLowerCase().includes(q));
  const openCard = board.lists.flatMap((l) => l.cards).find((c) => c.id === openCardId);

  const renameBoard = (title) => mutate(null, async () => { const d = await api(`/boards/${board.id}`, { method: 'PATCH', body: { title } }); setBoard(d.board); });
  const deleteBoard = async () => {
    if (!window.confirm(`Delete the board "${board.title}" and all of its cards?`)) return;
    await mutate(null, () => api(`/boards/${board.id}`, { method: 'DELETE' }));
    navigate('/boards');
  };
  const addList = async (title) => {
    const d = await api(`/boards/${board.id}/lists`, { method: 'POST', body: { title } });
    setLists((ls) => [...ls, d.list]);
  };
  const renameList = (list, title) => mutate((ls) => ls.map((l) => (l.id === list.id ? { ...l, title } : l)), () => api(`/lists/${list.id}`, { method: 'PATCH', body: { title } }));
  const deleteList = (list) => {
    if (list.cards.length && !window.confirm(`Delete the list "${list.title}" and its ${list.cards.length} cards?`)) return;
    mutate((ls) => ls.filter((l) => l.id !== list.id), () => api(`/lists/${list.id}`, { method: 'DELETE' }));
  };
  const addCard = async (list, title) => {
    const d = await api(`/lists/${list.id}/cards`, { method: 'POST', body: { title } });
    trackEvent('Card Created');
    setLists((ls) => ls.map((l) => (l.id === list.id ? { ...l, cards: [...l.cards, d.card] } : l)));
  };
  const saveCard = async (cardId, patch) => {
    const d = await api(`/cards/${cardId}`, { method: 'PATCH', body: patch });
    setLists((ls) => ls.map((l) => ({ ...l, cards: l.cards.map((c) => (c.id === cardId ? d.card : c)) })));
  };
  const deleteCard = (cardId) => {
    setOpenCardId(null);
    mutate((ls) => ls.map((l) => ({ ...l, cards: l.cards.filter((c) => c.id !== cardId) })), () => api(`/cards/${cardId}`, { method: 'DELETE' }));
  };

  const onCardDragStart = (e, card) => {
    drag.current = { type: 'card', id: card.id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `card:${card.id}`);
  };
  const onListDragStart = (e, list) => {
    drag.current = { type: 'list', id: list.id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `list:${list.id}`);
  };
  const onDragOver = (e) => { if (drag.current) e.preventDefault(); };
  const onDropOnList = (e, list) => {
    if (drag.current?.type !== 'card') return;
    e.preventDefault();
    e.stopPropagation();
    const index = dropIndex(e.currentTarget, '[data-card]', drag.current.id, e.clientY, 'y');
    moveCard(drag.current.id, list.id, index);
    drag.current = null;
  };
  const onDropOnBoard = (e) => {
    if (drag.current?.type !== 'list') return;
    e.preventDefault();
    moveList(drag.current.id, dropIndex(e.currentTarget, '[data-list]', drag.current.id, e.clientX, 'x'));
    drag.current = null;
  };

  return (
    <div className="board-page" style={{ '--board-color': board.color }}>
      <div className="board-header">
        <h1 className="board-title">
          {canEdit ? <InlineEdit value={board.title} label="Board title" maxLength={100} onSave={renameBoard} /> : <span className="board-title-static">{board.title}</span>}
          {!isOwner && <span className="board-badge">{board.role === 'viewer' ? 'View only' : 'Editor'} · shared by {board.owner}</span>}
        </h1>
        <div className="board-tools">
          <label htmlFor="card-search" className="visually-hidden">Filter cards</label>
          <input id="card-search" type="search" placeholder="Filter cards…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="btn btn-on-dark" onClick={() => setSharing(true)}>
            {isOwner ? 'Share' : 'Members'}{board.memberCount > 0 ? ` (${board.memberCount + 1})` : ''}
          </button>
          {isOwner && <button type="button" className="btn btn-on-dark" onClick={deleteBoard}>Delete board</button>}
        </div>
      </div>
      {error && <div className="container"><FormAlert message={error} /></div>}
      <p className="visually-hidden" aria-live="polite">{announcement}</p>
      {!canEdit && <p className="readonly-note">You can view this board but not change it.</p>}

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- mouse drag and drop; keyboard/touch users use the Move controls */}
      <ol className="lists" onDragOver={onDragOver} onDrop={onDropOnBoard} aria-label="Lists">
        {board.lists.map((list, listIndex) => (
          <li key={list.id} className="list" data-list data-id={list.id}>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drag handle; keyboard/touch users use Move left/right in the list menu */}
            <div className="list-header" draggable={canEdit} onDragStart={(e) => onListDragStart(e, list)} onDragEnd={() => { drag.current = null; }}>
              <h2 className="list-title">
                {canEdit ? <InlineEdit value={list.title} label="List title" maxLength={100} onSave={(t) => renameList(list, t)} /> : <span className="list-title-static">{list.title}</span>}
              </h2>
              {canEdit && (
              <details className="list-menu">
                <summary aria-label={`Actions for list ${list.title}`}>⋯</summary>
                <div className="menu-panel">
                  <button type="button" disabled={listIndex === 0} onClick={(e) => { e.currentTarget.closest('details').open = false; moveList(list.id, listIndex - 1); }}>Move left</button>
                  <button type="button" disabled={listIndex === board.lists.length - 1} onClick={(e) => { e.currentTarget.closest('details').open = false; moveList(list.id, listIndex + 1); }}>Move right</button>
                  <button type="button" className="danger" onClick={() => deleteList(list)}>Delete list</button>
                </div>
              </details>
              )}
            </div>
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- mouse drag and drop; keyboard/touch users use the Move controls */}
            <ul className="cards" onDragOver={onDragOver} onDrop={(e) => onDropOnList(e, list)} aria-label={`Cards in ${list.title}`}>
              {list.cards.filter(visible).map((card) => {
                const done = card.checklist.filter((i) => i.done).length;
                return (
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- mouse drag and drop; keyboard/touch users use the Move controls
                  <li key={card.id} data-card data-id={card.id} draggable={canEdit} onDragStart={(e) => onCardDragStart(e, card)} onDragEnd={() => { drag.current = null; }}>
                    <button type="button" className="card" onClick={() => setOpenCardId(card.id)}>
                      <LabelDots labels={card.labels} />
                      <span className="card-title">{card.title}</span>
                      {(card.dueDate || card.checklist.length > 0 || card.description) && (
                        <span className="card-meta">
                          {card.dueDate && <span>Due {new Date(`${card.dueDate}T00:00`).toLocaleDateString()}</span>}
                          {card.checklist.length > 0 && <span>{done}/{card.checklist.length} done</span>}
                          {card.description && <span>Has description</span>}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {canEdit && <AddForm label="Add a card" placeholder="Card title" maxLength={200} onAdd={(t) => addCard(list, t)} />}
          </li>
        ))}
        {canEdit && (
          <li className="list list-add">
            <AddForm label="Add a list" placeholder="List title" maxLength={100} onAdd={addList} />
          </li>
        )}
      </ol>

      {openCard && (
        <CardModal
          card={openCard}
          lists={board.lists}
          readOnly={!canEdit}
          onClose={() => setOpenCardId(null)}
          onSave={(patch) => saveCard(openCard.id, patch)}
          onMove={(listId, index) => moveCard(openCard.id, listId, index)}
          onDelete={() => deleteCard(openCard.id)}
        />
      )}

      {sharing && (
        <ShareDialog
          board={board}
          onClose={() => setSharing(false)}
          onLeft={() => navigate('/boards', { replace: true })}
          onMembersChange={(memberCount) => setBoard((b) => ({ ...b, memberCount }))}
        />
      )}
    </div>
  );
}
