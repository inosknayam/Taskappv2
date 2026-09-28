import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getConsent, setConsent } from '../lib/consent.js';

// Shown until the visitor makes a choice. Essential cookies (login session, this choice)
// are always on; analytics only load after "Accept analytics".
export default function CookieBanner() {
  const [open, setOpen] = useState(() => getConsent() === null);

  useEffect(() => {
    const onChange = (e) => setOpen(e.detail === null);
    window.addEventListener('consentchange', onChange);
    return () => window.removeEventListener('consentchange', onChange);
  }, []);

  if (!open) return null;
  return (
    <section className="cookie-banner" aria-label="Cookie consent">
      <p>
        We use essential cookies to keep you logged in. With your permission we also use privacy-friendly
        analytics to improve TaskApp. See our <Link to="/privacy#cookies">Privacy Policy</Link>.
      </p>
      <div className="cookie-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setConsent('denied')}>Reject analytics</button>
        <button type="button" className="btn btn-secondary" onClick={() => setConsent('granted')}>Accept analytics</button>
      </div>
    </section>
  );
}
