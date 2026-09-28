import { Link, Navigate, useNavigate } from 'react-router-dom';
import { validateSignup } from '../../../shared/validation.js';
import FormField from '../components/FormField.jsx';
import FormAlert from '../components/FormAlert.jsx';
import Honeypot from '../components/Honeypot.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useFormState } from '../lib/useFormState.js';
import { useSeo } from '../lib/seo.js';
import { trackEvent } from '../lib/analytics.js';

export default function Signup() {
  useSeo({ title: 'Create your free account', description: 'Sign up for TaskApp in seconds and start organising your projects on Kanban boards.', path: '/signup' });
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const f = useFormState({ name: '', email: '', password: '', acceptTerms: false }, validateSignup);

  if (user) return <Navigate to="/boards" replace />;

  const onSubmit = f.submit(async (values) => {
    await signup(values);
    trackEvent('Signup');
    navigate('/boards');
  });

  return (
    <div className="container narrow auth-page">
      <h1>Create your free account</h1>
      <form onSubmit={onSubmit} noValidate className="card-surface">
        <FormAlert message={f.formError} />
        <FormField label="Name" name="name" autoComplete="name" value={f.values.name} onChange={f.onChange} onBlur={f.onBlur} error={f.errors.name} required maxLength={60} />
        <FormField label="Email" name="email" type="email" autoComplete="email" value={f.values.email} onChange={f.onChange} onBlur={f.onBlur} error={f.errors.email} required />
        <FormField label="Password" name="password" type="password" autoComplete="new-password" value={f.values.password} onChange={f.onChange} onBlur={f.onBlur} error={f.errors.password} hint="At least 8 characters, with a letter and a number." required />
        <div className="field checkbox-field">
          <input id="acceptTerms" name="acceptTerms" type="checkbox" checked={f.values.acceptTerms} onChange={f.onChange} aria-invalid={f.errors.acceptTerms ? 'true' : undefined} aria-describedby={f.errors.acceptTerms ? 'acceptTerms-error' : undefined} />
          <label htmlFor="acceptTerms">I agree to the <Link to="/terms">Terms &amp; Conditions</Link> and <Link to="/privacy">Privacy Policy</Link>.</label>
          {f.errors.acceptTerms && <p id="acceptTerms-error" className="field-error">{f.errors.acceptTerms}</p>}
        </div>
        <Honeypot />
        <button type="submit" className="btn btn-primary btn-block" disabled={f.submitting}>{f.submitting ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
    </div>
  );
}
