import { createContext, useContext, useEffect, useRef, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEventStore } from '@/data/store';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';

const AuthContext = createContext<ReturnType<typeof useAuth> | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { syncAll } = useSupabaseSync();
  const syncedUserRef = useRef<string | null>(null);

  // Sync Supabase auth state to Zustand store so existing components still work
  useEffect(() => {
    if (auth.user) {
      useEventStore.getState().setUserProfile({
        id: auth.user.id,
        firstName: auth.user.user_metadata.first_name ?? '',
        lastName: auth.user.user_metadata.last_name ?? '',
        email: auth.user.email ?? '',
        role: auth.user.user_metadata.role ?? 'coordinator',
        createdAt: auth.user.created_at,
      });

      // Sync data from Supabase once per user session
      if (syncedUserRef.current !== auth.user.id) {
        syncedUserRef.current = auth.user.id;
        syncAll(auth.user.id);
      }
    } else if (!auth.loading) {
      // User signed out — clear Zustand profile
      syncedUserRef.current = null;
      useEventStore.getState().signOut();
    }
  }, [auth.user, auth.loading, syncAll]);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
