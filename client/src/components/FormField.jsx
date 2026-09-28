import { useId } from 'react';

// Accessible input: visible label, error linked with aria-describedby, aria-invalid.
export default function FormField({ label, name, error, hint, as = 'input', ...props }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const Control = as;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <Control id={id} name={name} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} {...props} />
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      {error && <p id={errorId} className="field-error">{error}</p>}
    </div>
  );
}
