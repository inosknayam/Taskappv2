// Hidden from people (and screen readers) but visible to naive bots. The server rejects
// any submission where this field is filled in.
export default function Honeypot() {
  return (
    <div className="hp-field" aria-hidden="true">
      <label htmlFor="website">Leave this field empty</label>
      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  );
}
