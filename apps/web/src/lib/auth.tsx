import { LEGAL_VERSION } from '../pages/legalText';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { KhError, toAuthError, type Profile } from '@khatafy/core';
import { api, isConfigured, supabase } from './supabase';
import { clearCache } from './data';
import { navigate } from './router';
import { useT } from './i18n';

interface AuthCtx {
  status: 'loading' | 'out' | 'in';
  session: Session | null;
  profile: Profile | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<{ needsVerification: boolean }>;
  signOut(): Promise<void>;
  sendReset(email: string): Promise<void>;
  setPassword(password: string): Promise<void>;
  /** Re-verifies the current password first, then sets the new one. */
  changePassword(current: string, next: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  refreshProfile(): Promise<void>;
  expireSession(): void;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthCtx['status']>(isConfigured ? 'loading' : 'out');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { setLang } = useT();
  const userId = session?.user.id ?? null;
  const expiring = useRef(false);

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setStatus(data.session ? 'in' : 'out');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // never call supabase from inside this callback synchronously (deadlock risk)
      setTimeout(() => {
        if (!alive) return;
        setSession(s);
        setStatus(s ? 'in' : 'out');
        if (event === 'PASSWORD_RECOVERY') navigate('/reset-password', { replace: true });
        if (event === 'SIGNED_OUT') { clearCache(); setProfile(null); }
      }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const refreshProfile = useCallback(async () => {
    const p = await api.getMyProfile();
    setProfile(p);
    if (p?.preferred_language) setLang(p.preferred_language);
  }, [setLang]);

  useEffect(() => {
    if (!userId) return;
    refreshProfile().catch(() => { /* surfaced by pages that need it */ });
  }, [userId, refreshProfile]);

  const value = useMemo<AuthCtx>(() => ({
    status, session, profile,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw toAuthError(error);
    },
    async signUp(name, email, password) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: name.trim(), terms_accepted_at: new Date().toISOString(), terms_version: LEGAL_VERSION }, emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw toAuthError(error);
      // Supabase hides "already registered" by returning a user without identities.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new KhError('AUTH_USER_EXISTS');
      return { needsVerification: !data.session };
    },
    async signOut() {
      await supabase.auth.signOut();
      clearCache();
      setProfile(null);
      navigate('/login', { replace: true });
    },
    async sendReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw toAuthError(error);
    },
    async setPassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw toAuthError(error);
    },
    async changePassword(current, next) {
      const email = session?.user.email;
      if (!email) throw new KhError('AUTH_REQUIRED');
      const { error: vErr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (vErr) throw new KhError('CURRENT_PASSWORD_WRONG');
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw toAuthError(error);
    },
    async resendVerification(email) {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (error) throw toAuthError(error);
    },
    async signInWithGoogle() {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } });
      if (error) throw toAuthError(error);
    },
    refreshProfile,
    expireSession() {
      if (expiring.current) return;
      expiring.current = true;
      supabase.auth.signOut().finally(() => {
        clearCache();
        setProfile(null);
        sessionStorage.setItem('kh.expired', '1');
        navigate('/login', { replace: true });
        expiring.current = false;
      });
    },
  }), [status, session, profile, refreshProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
