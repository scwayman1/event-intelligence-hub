import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEventStore } from '@/data/store';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';

const AuthContext = createContext<ReturnType<typeof useAuth> & { syncing: boolean } | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { syncAll } = useSupabaseSync();
  const syncedUserRef = useRef<string | null>(null);
  // Start syncing=true so we block rendering until sync completes.
  // This prevents a one-frame gap where RequireOnboarding redirects
  // to /welcome before Supabase data has loaded.
  const [syncing, setSyncing] = useState(true);

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

      // Sync data from Supabase once per user session — AWAIT it
      if (syncedUserRef.current !== auth.user.id) {
        syncedUserRef.current = auth.user.id;
        setSyncing(true);
        syncAll(auth.user.id).finally(() => setSyncing(false));
      } else {
        // Already synced for this user — stop blocking
        setSyncing(false);
      }
    } else if (!auth.loading) {
      // User signed out — clear Zustand profile
      syncedUserRef.current = null;
      setSyncing(false);
      useEventStore.getState().signOut();
    }
  }, [auth.user, auth.loading, syncAll]);

  const value = { ...auth, syncing };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
