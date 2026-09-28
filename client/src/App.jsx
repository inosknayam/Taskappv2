import { Suspense, lazy, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Landing from './pages/Landing.jsx';
import { trackPageview } from './lib/analytics.js';

// Route-level code splitting keeps the landing page bundle small.
const Login = lazy(() => import('./pages/Login.jsx'));
const Signup = lazy(() => import('./pages/Signup.jsx'));
const Boards = lazy(() => import('./pages/Boards.jsx'));
const Board = lazy(() => import('./pages/Board.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));
const Privacy = lazy(() => import('./pages/Privacy.jsx'));
const Terms = lazy(() => import('./pages/Terms.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

function PageviewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Board ids are replaced so analytics never records user-specific URLs.
    trackPageview(pathname.replace(/\/boards\/\d+/, '/boards/:id'));
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <Layout>
      <PageviewTracker />
      <Suspense fallback={<p className="page-loading" role="status">Loading…</p>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/boards" element={<RequireAuth><Boards /></RequireAuth>} />
          <Route path="/boards/:boardId" element={<RequireAuth><Board /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
