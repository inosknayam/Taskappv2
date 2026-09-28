import { Link } from 'react-router-dom';
import { useSeo } from '../lib/seo.js';
import { useAuth } from '../lib/auth.jsx';

export default function NotFound() {
  useSeo({ title: 'Page not found', description: 'The page you are looking for does not exist.', noindex: true });
  const { user } = useAuth();
  return (
    <div className="container narrow not-found">
      <img src="/images/lost-card.svg" alt="" width="200" height="140" />
      <p className="error-code">404</p>
      <h1>We couldn&apos;t find that page</h1>
      <p>The link may be broken, or the page may have been moved or deleted.</p>
      <Link to={user ? '/boards' : '/'} className="btn btn-primary">{user ? 'Back to your boards' : 'Go to the home page'}</Link>
    </div>
  );
}
