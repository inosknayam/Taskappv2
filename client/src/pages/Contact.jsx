import { useState } from 'react';
import { validateContact } from '../../../shared/validation.js';
import FormField from '../components/FormField.jsx';
import FormAlert from '../components/FormAlert.jsx';
import Honeypot from '../components/Honeypot.jsx';
import { api } from '../lib/api.js';
import { useFormState } from '../lib/useFormState.js';
import { useSeo } from '../lib/seo.js';
import { trackEvent } from '../lib/analytics.js';

export default function Contact() {
  useSeo({ title: 'Contact us', description: 'Questions, feedback or a privacy request? Send the TaskApp team a message.', path: '/contact' });
  const [sent, setSent] = useState(false);
  const f = useFormState({ name: '', email: '', message: '' }, validateContact);

  const onSubmit = f.submit(async (values) => {
    await api('/contact', { method: 'POST', body: values });
    trackEvent('Contact Sent');
    setSent(true);
  });

  return (
    <div className="container narrow">
      <h1>Contact us</h1>
      {sent ? (
        <p className="form-success" role="status">Thanks! Your message has been sent. We usually reply within two working days.</p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="card-surface">
          <FormAlert message={f.formError} />
          <FormField label="Name" name="name" autoComplete="name" value={f.values.name} onChange={f.onChange} onBlur={f.onBlur} error={f.errors.name} required maxLength={60} />
          <FormField label="Email" name="email" type="email" autoComplete="email" value={f.values.email} onChange={f.onChange} onBlur={f.onBlur} error={f.errors.email} required />
          <FormField as="textarea" label="Message" name="message" rows={6} value={f.values.message} onChange={f.onChange} onBlur={f.onBlur} error={f.errors.message} hint="10 to 2000 characters." required maxLength={2000} />
          <Honeypot />
          <button type="submit" className="btn btn-primary" disabled={f.submitting}>{f.submitting ? 'Sending…' : 'Send message'}</button>
        </form>
      )}
    </div>
  );
}
