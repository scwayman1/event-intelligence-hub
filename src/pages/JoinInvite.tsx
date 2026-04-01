import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useAuthContext } from '@/contexts/AuthContext';
import { Sprout, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchTeamInviteByCode } from '@/services/supabase-db';
import { supabase } from '@/integrations/supabase/client';

export default function JoinInvite() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthContext();

  const redeemInvite = useEventStore((s) => s.redeemInvite);
  const setPendingInviteCode = useEventStore((s) => s.setPendingInviteCode);

  const [status, setStatus] = useState<'loading' | 'not-found' | 'expired' | 'used' | 'already-member' | 'ready' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [orgName, setOrgName] = useState('');

  // Use a ref to prevent the effect from re-running when store data changes
  // (hydrating org/invite into the store was causing an infinite loop)
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    if (!inviteCode) {
      setStatus('not-found');
      return;
    }

    if (!user) {
      const existingPending = useEventStore.getState().pendingInviteCode;
      if (existingPending === inviteCode) {
        return;
      }
      setPendingInviteCode(inviteCode);
      navigate('/sign-up', { replace: true });
      return;
    }

    // Only resolve the invite once per mount
    if (resolvedRef.current) return;
    resolvedRef.current = true;

    // Try local store first, then fall back to Supabase
    const localInvite = useEventStore.getState().findInviteByCode(inviteCode);
    if (localInvite) {
      applyInvite(localInvite);
      return;
    }

    // Fetch from Supabase — invite was created on another device
    let cancelled = false;
    fetchTeamInviteByCode(inviteCode)
      .then(async (dbInvite) => {
        if (cancelled) return;
        if (!dbInvite) {
          console.error('[JoinInvite] Invite not found in Supabase for code:', inviteCode);
          setStatus('not-found');
          return;
        }
        console.log('[JoinInvite] Found invite in Supabase:', dbInvite.id, 'orgId:', dbInvite.orgId);
        // Hydrate invite into local store so redeemInvite can find it.
        // Always replace with fresh DB data in case a prior attempt left
        // the invite marked as used locally but the DB write failed.
        useEventStore.setState((s) => {
          const filtered = s.teamInvites.filter((i) => i.id !== dbInvite.id);
          return { teamInvites: [...filtered, dbInvite] };
        });
        // Also hydrate the org if not in local store
        const orgs = useEventStore.getState().organizations;
        let name = orgs.find((o) => o.id === dbInvite.orgId)?.name;
        if (!name) {
          const { data: orgRow, error: orgError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', dbInvite.orgId)
            .maybeSingle();
          if (orgError) {
            console.error('[JoinInvite] Failed to fetch org:', orgError);
          }
          name = orgRow?.name ?? 'Unknown Organization';
          if (orgRow) {
            const org = {
              id: orgRow.id,
              name: orgRow.name,
              shortName: orgRow.short_name,
              createdAt: orgRow.created_at,
            };
            useEventStore.setState((s) => {
              const exists = s.organizations.some((o) => o.id === org.id);
              if (exists) return {};
              return { organizations: [...s.organizations, org] };
            });
          }
        }
        if (cancelled) return;
        applyInvite(dbInvite, name);
      })
      .catch((err) => {
        console.error('[JoinInvite] Supabase fetch error:', err);
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(
            `Could not verify this invite. ${err instanceof Error ? err.message : 'Please try refreshing the page.'}`,
          );
        }
      });
    return () => { cancelled = true; };

    function applyInvite(invite: { usedBy?: string | null; expiresAt: string; orgId: string }, overrideName?: string) {
      if (invite.usedBy) {
        setStatus('used');
        return;
      }
      if (new Date(invite.expiresAt) < new Date()) {
        setStatus('expired');
        return;
      }
      const org = useEventStore.getState().organizations.find((o) => o.id === invite.orgId);
      setOrgName(overrideName ?? org?.name ?? 'Unknown Organization');
      setStatus('ready');
    }
  }, [authLoading, user, inviteCode, navigate, setPendingInviteCode]); // removed organizations & findInviteByCode — use getState() instead

  function handleJoin() {
    if (!inviteCode) return;
    const result = redeemInvite(inviteCode);
    if (result.success) {
      setStatus('success');
      // Force a full page reload so AuthContext re-runs syncAll.
      // syncAll already ran before the invite was redeemed (and returned
      // empty because the user wasn't a member yet). A reload triggers
      // a fresh sync that loads the org's events, guests, etc.
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } else if (result.error?.includes('already a member')) {
      useEventStore.setState({ hasCompletedOnboarding: true, pendingInviteCode: null });
      setStatus('already-member');
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } else {
      setStatus('error');
      setErrorMessage(result.error ?? 'Something went wrong.');
    }
  }

  if (authLoading || status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, hsl(152 68% 42%), hsl(84 60% 48%))' }}>
            <Sprout className="w-7 h-7 text-white" />
          </div>
        </div>

        <div className="glass-panel p-6 space-y-4 text-center">
          {status === 'not-found' && (
            <>
              <XCircle className="w-12 h-12 text-destructive mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Invalid Invite</h2>
              <p className="text-sm text-muted-foreground">
                This invite link is invalid or has been revoked. Please ask the team admin for a new invite.
              </p>
            </>
          )}

          {status === 'expired' && (
            <>
              <Clock className="w-12 h-12 text-warning mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Invite Expired</h2>
              <p className="text-sm text-muted-foreground">
                This invite link has expired. Please ask the team admin to send a new one.
              </p>
            </>
          )}

          {status === 'used' && (
            <>
              <XCircle className="w-12 h-12 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Already Used</h2>
              <p className="text-sm text-muted-foreground">
                This invite has already been accepted by another user.
              </p>
            </>
          )}

          {status === 'already-member' && (
            <>
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Already a Member</h2>
              <p className="text-sm text-muted-foreground">
                You are already a member of this organization.
              </p>
              <Button onClick={() => navigate('/', { replace: true })} className="mt-2">
                Go to Dashboard
              </Button>
            </>
          )}

          {status === 'ready' && (
            <>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Sprout className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Join {orgName}</h2>
              <p className="text-sm text-muted-foreground">
                You have been invited to join <span className="font-medium text-foreground">{orgName}</span> on Grad Roots EventMap.
              </p>
              <Button onClick={handleJoin} className="w-full mt-2">
                Accept Invite & Join
              </Button>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Welcome!</h2>
              <p className="text-sm text-muted-foreground">
                You have joined <span className="font-medium text-foreground">{orgName}</span>. Redirecting to your dashboard...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="w-12 h-12 text-destructive mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </>
          )}

          {(status === 'not-found' || status === 'expired' || status === 'used' || status === 'error') && (
            <div className="pt-2">
              <Link to="/" className="text-sm text-primary font-medium hover:underline">
                Go to Dashboard
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
