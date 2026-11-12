import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { usersApi } from '../api/endpoints.js';

/** Optimistically saves a partial preferences patch, rolling back on failure. */
export function usePreferences() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (patch, { successMessage = 'Preferences saved' } = {}) => {
      const previous = user;
      const merged = {
        ...user,
        preferences: {
          ...user.preferences,
          ...patch,
          ai: { ...user.preferences.ai, ...(patch.ai || {}) },
          library: { ...user.preferences.library, ...(patch.library || {}) },
        },
      };
      setUser(merged);
      setSaving(true);
      try {
        const { user: updated } = await usersApi.updatePreferences(patch);
        setUser(updated);
        if (successMessage) toast.success(successMessage);
      } catch (err) {
        setUser(previous);
        toast.error(`Couldn't save: ${err.message}`);
      } finally {
        setSaving(false);
      }
    },
    [user, setUser, toast]
  );

  return { preferences: user?.preferences, save, saving };
}
