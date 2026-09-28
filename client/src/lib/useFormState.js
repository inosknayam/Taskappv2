import { useRef, useState } from 'react';
import { ApiError } from './api.js';

// Shared form helper: runs a shared validator on submit, shows inline field errors,
// maps server-side field errors back onto inputs, and adds spam-protection fields.
export function useFormState(initial, validate) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef(Date.now());

  const onChange = (e) => {
    const { name, type, checked, value } = e.target;
    setValues((v) => ({ ...v, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((errs) => ({ ...errs, [name]: undefined }));
  };

  const onBlur = (e) => {
    const { name } = e.target;
    if (!validate || !values[name]) return;
    const v = validate(values);
    setErrors((errs) => ({ ...errs, [name]: v.errors[name] }));
  };

  const submit = (action) => async (e) => {
    e.preventDefault();
    setFormError('');
    const form = e.currentTarget;
    if (validate) {
      const v = validate(values);
      if (!v.ok) {
        setErrors(v.errors);
        focusFirstError(form, v.errors);
        return;
      }
    }
    setSubmitting(true);
    try {
      await action({ ...values, website: form.elements.website?.value ?? '', formStartedAt: startedAt.current });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields || {});
        setFormError(err.message);
        focusFirstError(form, err.fields || {});
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return { values, setValues, errors, formError, submitting, onChange, onBlur, submit };
}

function focusFirstError(form, errors) {
  const first = Object.keys(errors).find((k) => errors[k]);
  if (first) form.elements[first]?.focus?.();
}
