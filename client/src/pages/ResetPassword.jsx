import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { validateResetPassword } from '../../../shared/validation.js';
import FormField from '../components/FormField.jsx';
import FormAlert from '../components/FormAlert.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFormState } from '../lib/useFormState.js';
import { useSeo } from '../lib/seo.js';

export default function ResetPassword() {
  useSeo({ title: 'Choose a new password', description: 'Choose a new password for your TaskApp account.', path: '/reset-password', noindex: true });
  const navigate = useNavigate();
  const { setUser } = useAuth();
  // Read the token once, then drop it from the address bar so it isn't kept in history.
  const [token] = useState(() => {
    const t = new URLSearchParams(location.search).get('token') || '';
    if (t) history.replaceState(null, '', location.pathname);
    return t;
  });
  const f = useFormState({ password: '', confirmPassword: '' }, (values) => validateResetPassword({ ...values, token }));

  const onSubmit = f.submit(async (values) => {
    const d = await api('/auth/reset-password', { method: 'POST', body: { token, password: values.password, confirmPassword: values.confirmPassword } });
    setUser(d.user);
    navigate('/boards', { replace: true });
  });

  const linkBroken = !token || f.errors.token;
  return (
    <div className="container narrow auth-page">
      <h1>Choose a new password</h1>
      {linkBroken ? (
        <div className="card-surface">
          <p className="form-alert" role="alert">This reset link is invalid or has expired.</p>
          <Link to="/forgot-password" className="btn btn-primary">Request a new link</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="card-surface">
          <FormAlert message={f.formError} />
          <FormField label="New password" name="password" type="password" autoComplete="new-password" value={f.values.password} onChange={f.onChange} onBlur={f.onBlur} error={f.errors.password} hint="At least 8 characters, with a letter and a number." required />
          <FormField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" value={f.values.confirmPassword} onChange={f.onChange} onBlur={f.onBlur} error={f.errors.confirmPassword} required />
          <button type="submit" className="btn btn-primary btn-block" disabled={f.submitting}>{f.submitting ? 'Saving…' : 'Save new password'}</button>
        </form>
      )}
    </div>
  );
}
