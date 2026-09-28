import { Link } from 'react-router-dom';
import { resetConsent } from '../lib/consent.js';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>© {new Date().getFullYear()} TaskApp</p>
        <nav aria-label="Footer">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms &amp; Conditions</Link>
          <Link to="/contact">Contact</Link>
          <button type="button" className="link-button" onClick={resetConsent}>Cookie settings</button>
        </nav>
      </div>
    </footer>
  );
}
