import Header from './Header.jsx';
import Footer from './Footer.jsx';
import CookieBanner from './CookieBanner.jsx';

export default function Layout({ children }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to main content</a>
      <Header />
      <main id="main" tabIndex={-1}>{children}</main>
      <Footer />
      <CookieBanner />
    </div>
  );
}
