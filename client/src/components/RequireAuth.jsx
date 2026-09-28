import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="page-loading" role="status">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
