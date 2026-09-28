import { Link } from 'react-router-dom';
import { useSeo } from '../lib/seo.js';
import { useAuth } from '../lib/auth.jsx';

const FEATURES = [
  { title: 'Boards for every project', text: 'Keep work, side projects and personal to-dos on separate boards.' },
  { title: 'Drag and drop', text: 'Move cards from To do to Done with your mouse, finger or keyboard.' },
  { title: 'Details that matter', text: 'Add descriptions, due dates, labels and checklists to any card.' },
];

export default function Landing() {
  const { user } = useAuth();
  useSeo({
    description: 'TaskApp is a free, fast Kanban task manager. Organise projects into boards, lists and cards, and drag work from To do to Done.',
    path: '/',
  });

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <h1>Organise every project on one simple board</h1>
            <p className="lead">Plan tasks in lists, drag them to done, and see at a glance what needs your attention. Free, fast and private.</p>
            {/* The page's single primary call to action. */}
            <Link to={user ? '/boards' : '/signup'} className="btn btn-primary btn-lg">
              {user ? 'Go to your boards' : 'Start for free'}
            </Link>
            {!user && <p className="hero-note">No credit card needed.</p>}
          </div>
          <img
            className="hero-image"
            src="/images/board-preview.svg"
            alt="A TaskApp board with three columns, To do, Doing and Done, each holding task cards"
            width="560"
            height="380"
          />
        </div>
      </section>
      <section className="container features" aria-labelledby="features-title">
        <h2 id="features-title">Everything you need, nothing you don&apos;t</h2>
        <ul className="feature-grid">
          {FEATURES.map((f) => (
            <li key={f.title} className="feature">
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
