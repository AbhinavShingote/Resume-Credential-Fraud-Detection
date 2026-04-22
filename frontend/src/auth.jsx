/**
 * Authentication context + provider + hook.
 *
 * Wraps the whole app (<App /> does this) so any component can do:
 *
 *   const { user, login, logout } = useAuth();
 *
 * ...without threading props through 5 levels of components.
 *
 * State is persisted to localStorage via api.js's tokenStore / userStore,
 * so users stay logged in across browser refreshes.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, tokenStore, userStore } from './api.js';

const AuthContext = createContext(null);


export function AuthProvider({ children }) {
  // Hydrate initial state from localStorage (keeps users logged in on refresh)
  const [user, setUser] = useState(() => userStore.get());
  const [loading, setLoading] = useState(false);

  // On first load, if we have a token, verify it with /auth/me.
  // If the token is expired/invalid, clear state and force a re-login.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token || !user) return;

    api.get('/auth/me')
      .then((freshUser) => {
        setUser(freshUser);
        userStore.set(freshUser);
      })
      .catch(() => {
        // Token expired or user deleted — clean up
        tokenStore.clear();
        userStore.clear();
        setUser(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      tokenStore.set(res.access_token);
      userStore.set(res.user);
      setUser(res.user);
      return res.user;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email, name, password) => {
    setLoading(true);
    try {
      // Create the account
      await api.post('/auth/register', { email, name, password, role: 'recruiter' });
      // Immediately log them in so they don't have to type credentials again
      const res = await api.post('/auth/login', { email, password });
      tokenStore.set(res.access_token);
      userStore.set(res.user);
      setUser(res.user);
      return res.user;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    userStore.clear();
    setUser(null);
  }, []);

  // useMemo prevents unnecessary re-renders of every consumer
  const value = useMemo(
    () => ({ user, login, register, logout, loading, isAuthenticated: !!user }),
    [user, login, register, logout, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


/**
 * Hook for any component to access the auth state.
 *
 * Usage:
 *   function Header() {
 *     const { user, logout } = useAuth();
 *     return <button onClick={logout}>Sign out ({user.name})</button>;
 *   }
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be used inside <AuthProvider>');
  }
  return ctx;
}