import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to={user ? '/boards' : '/'} className="brand">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <span>TaskApp</span>
        </Link>
        <nav aria-label="Main">
          {user ? (
            <>
              <NavLink to="/boards">Boards</NavLink>
              <button type="button" className="link-button" onClick={onLogout}>Log out</button>
            </>
          ) : (
            <NavLink to="/login">Log in</NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
