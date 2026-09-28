import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { validateLogin } from '../../../shared/validation.js';
import FormField from '../components/FormField.jsx';
import FormAlert from '../components/FormAlert.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useFormState } from '../lib/useFormState.js';
import { useSeo } from '../lib/seo.js';
import { trackEvent } from '../lib/analytics.js';

export default function Login() {
  useSeo({ title: 'Log in', description: 'Log in to TaskApp to see your boards, lists and cards.', path: '/login' });
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const f = useFormState({ email: '', password: '' }, validateLogin);
  const from = location.state?.from || '/boards';

  if (user) return <Navigate to={from} replace />;

  const onSubmit = f.submit(async (values) => {
    await login(values);
    trackEvent('Login');
    navigate(from, { replace: true });
  });

  return (
    <div className="container narrow auth-page">
      <h1>Log in</h1>
      <form onSubmit={onSubmit} noValidate className="card-surface">
        <FormAlert message={f.formError} />
        <FormField label="Email" name="email" type="email" autoComplete="email" value={f.values.email} onChange={f.onChange} onBlur={f.onBlur} error={f.errors.email} required />
        <FormField label="Password" name="password" type="password" autoComplete="current-password" value={f.values.password} onChange={f.onChange} error={f.errors.password} required />
        <p className="forgot-link"><Link to="/forgot-password">Forgot your password?</Link></p>
        <button type="submit" className="btn btn-primary btn-block" disabled={f.submitting}>{f.submitting ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="auth-switch">New to TaskApp? <Link to="/signup">Create an account</Link></p>
    </div>
  );
}
