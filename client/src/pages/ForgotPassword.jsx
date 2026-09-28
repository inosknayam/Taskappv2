import { useState } from 'react';
import { Link } from 'react-router-dom';
import { validateForgotPassword } from '../../../shared/validation.js';
import FormField from '../components/FormField.jsx';
import FormAlert from '../components/FormAlert.jsx';
import Honeypot from '../components/Honeypot.jsx';
import { api } from '../lib/api.js';
import { useFormState } from '../lib/useFormState.js';
import { useSeo } from '../lib/seo.js';

export default function ForgotPassword() {
  useSeo({ title: 'Reset your password', description: 'Forgot your TaskApp password? Get a reset link by email.', path: '/forgot-password', noindex: true });
  const [message, setMessage] = useState('');
  const f = useFormState({ email: '' }, validateForgotPassword);

  const onSubmit = f.submit(async (values) => {
    const d = await api('/auth/forgot-password', { method: 'POST', body: values });
    setMessage(d.message);
  });

  return (
    <div className="container narrow auth-page">
      <h1>Reset your password</h1>
      {message ? (
        <div className="card-surface">
          <p className="form-success" role="status">{message}</p>
          <p>The link expires in 1 hour. Check your spam folder if you don&apos;t see it within a few minutes.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="card-surface">
          <p>Enter the email you signed up with and we&apos;ll send you a link to choose a new password.</p>
          <FormAlert message={f.formError} />
          <FormField label="Email" name="email" type="email" autoComplete="email" value={f.values.email} onChange={f.onChange} onBlur={f.onBlur} error={f.errors.email} required />
          <Honeypot />
          <button type="submit" className="btn btn-primary btn-block" disabled={f.submitting}>{f.submitting ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
      <p className="auth-switch"><Link to="/login">Back to log in</Link></p>
    </div>
  );
}
