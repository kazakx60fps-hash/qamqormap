import { useCallback, useState } from 'react';
import { ApiError, type FieldCode } from './api';

/** Форма күйі және сервердің өріс қателері (field_codes) */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, FieldCode>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const set = useCallback(<K extends keyof T>(k: K, v: T[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => {
      if (!e[k as string]) return e;
      const n = { ...e };
      delete n[k as string];
      return n;
    });
  }, []);
  const submit = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setFormError(null);
    try {
      await fn();
      setErrors({});
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldCodes).length) setErrors(e.fieldCodes);
      setFormError(e);
    } finally {
      setBusy(false);
    }
  }, []);
  return { values, set, setValues, errors, setErrors, busy, formError, submit };
}
