import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type UserRole = 'admin' | 'investor' | 'viewer' | null;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: UserRole;
  // true for admin/investor — false only for viewer. Use this to gate any control that
  // creates/edits/deletes/imports data; viewers can see everything but write nothing.
  canEdit: boolean;
  mustChangePassword: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Normalize the stored role: 'admin' and 'viewer' are explicit, everything else
  // (the legacy 'user' value, unset, or anything unrecognized) is treated as 'investor' —
  // full access short of user management, matching what every non-admin account could
  // already do before the viewer role existed. This means no existing account loses
  // access just because its metadata hasn't been migrated yet; only an explicit 'viewer'
  // assignment restricts anything.
  const rawRole = session?.user?.user_metadata?.role as string | undefined;
  const role: UserRole = !session ? null : rawRole === 'admin' ? 'admin' : rawRole === 'viewer' ? 'viewer' : 'investor';
  const canEdit = role === 'admin' || role === 'investor';
  const mustChangePassword = !!session?.user?.user_metadata?.must_change_password;

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, role, canEdit, mustChangePassword, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
