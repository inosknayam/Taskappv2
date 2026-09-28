# Accessibility: Alt Text, Colour Contrast & Mobile Responsiveness

TaskApp targets **WCAG 2.1 AA**.

## Image alt text

- Every `<img>` has an `alt` attribute:
  - the landing hero image has a descriptive alt ("A TaskApp board with three columns…");
  - purely decorative images (the header logo next to the "TaskApp" text, the 404 illustration) use `alt=""` so screen readers skip them;
  - the social image has `og:image:alt`.
- Enforced two ways:
  - `npm run check:images` fails on any `<img>` without `alt` or without `width`/`height`;
  - `npm run lint` runs `eslint-plugin-jsx-a11y` in strict mode, including `jsx-a11y/alt-text`.
- **Rule for new images:** describe what the image communicates, not what it looks like. If it adds nothing, use `alt=""`.

## Colour contrast fixes

- All colours are CSS custom properties in `client/src/styles.css`.
- `npm run check:contrast` computes the WCAG contrast ratio for 29 foreground/background pairs: text, muted text, links, buttons, errors, labels, the cookie banner and every board colour. It fails below **4.5:1** for text and **3:1** for UI components such as input borders and the focus ring.
- Changes made for contrast:
  - muted text is `#475569` (7.6:1), not the common `#94a3b8` (2.6:1, which fails);
  - input borders are `#64748b` (4.8:1);
  - card labels use dark text on light tints and always include a text name, so colour is never the only signal;
  - board colours were chosen so white text passes on every one (lowest is amber, at 5.0:1);
  - the focus ring is a 3px amber outline, visible on both light and dark surfaces.

## Mobile responsiveness

- Mobile-first CSS with fluid type (`clamp`) and `max-width: 100%` images.
- **Board view:** lists scroll horizontally with **scroll-snap**. Each list is `min(85vw, 290px)` wide, so one list fits on a phone, with a peek of the next.
- **Touch and keyboard:** HTML5 drag and drop doesn't work on touch screens, so every card also has **Move card → List / Position** in its dialog, and every list has **Move left / Move right** in its ⋯ menu. The same controls serve keyboard and screen-reader users. A live region announces moves.
- Touch targets are at least 44×44px for buttons and inputs.
- The header, footer, cookie banner and forms wrap on narrow screens. The card dialog is `min(640px, 100vw − 2rem)`.
- Test at 360px, 768px and 1280px widths (Chrome DevTools device toolbar), and on a real phone.

## Other accessibility features

- A "Skip to main content" link, and landmarks: `header`, `nav` (labelled), `main`, `footer`.
- Form fields have visible labels. Errors are linked with `aria-describedby` and flagged with `aria-invalid`, and focus moves to the first invalid field.
- The card dialog uses native `<dialog>` with `showModal()`, which traps focus and closes on Escape.
- `prefers-reduced-motion` is respected.
- Lighthouse CI requires an accessibility score of at least 95 (see [PERFORMANCE.md](PERFORMANCE.md)).
