import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (body) => setUser((await api('/auth/login', { method: 'POST', body })).user), []);
  const signup = useCallback(async (body) => setUser((await api('/auth/signup', { method: 'POST', body })).user), []);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);
  const deleteAccount = useCallback(async () => {
    await api('/auth/me', { method: 'DELETE' });
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, signup, logout, deleteAccount }), [user, loading, login, signup, logout, deleteAccount]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
