import { useCallback, useState } from 'react';
import { ApiRequestError } from '../api/client.js';

/**
 * Minimal form state: values, field errors (client or server) and a submit wrapper
 * that maps API validation errors onto fields and everything else to formError.
 */
export function useForm(initial, { validate } = {}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const bind = useCallback(
    (name) => ({
      name,
      value: values[name] ?? '',
      error: errors[name],
      onChange: (e) => {
        const v = e?.target ? e.target.value : e;
        setValues((s) => ({ ...s, [name]: v }));
        setErrors((s) => (s[name] ? { ...s, [name]: undefined } : s));
      },
    }),
    [values, errors]
  );

  const handleSubmit = (fn) => async (e) => {
    e?.preventDefault?.();
    setFormError(null);
    const clientErrors = validate?.(values) || {};
    if (Object.values(clientErrors).some(Boolean)) {
      setErrors(clientErrors);
      return;
    }
    setSubmitting(true);
    try {
      await fn(values);
    } catch (err) {
      if (err instanceof ApiRequestError && Object.keys(err.fields).length) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).some((k) => k in values)) setFormError(err.message);
      } else {
        setFormError(err.message || 'Something went wrong');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reset = useCallback((next = initial) => {
    setValues(next);
    setErrors({});
    setFormError(null);
  }, [initial]);

  return { values, setValues, errors, setErrors, formError, setFormError, submitting, bind, handleSubmit, reset };
}
