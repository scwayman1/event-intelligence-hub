import { useEffect, useState } from 'react';
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

  const findInviteByCode = useEventStore((s) => s.findInviteByCode);
  const redeemInvite = useEventStore((s) => s.redeemInvite);
  const setPendingInviteCode = useEventStore((s) => s.setPendingInviteCode);
  const organizations = useEventStore((s) => s.organizations);

  const [status, setStatus] = useState<'loading' | 'not-found' | 'expired' | 'used' | 'already-member' | 'ready' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [orgName, setOrgName] = useState('');
  const [remoteInvite, setRemoteInvite] = useState<Awaited<ReturnType<typeof fetchTeamInviteByCode>> | undefined>(undefined);

  useEffect(() => {
    if (authLoading) return;

    if (!inviteCode) {
      setStatus('not-found');
      return;
    }

    // If not logged in, store the invite code and redirect to sign-up
    if (!user) {
      setPendingInviteCode(inviteCode);
      navigate('/sign-up', { replace: true });
      return;
    }

    // Try local store first, then fall back to Supabase
    const localInvite = findInviteByCode(inviteCode);
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
          setStatus('not-found');
          return;
        }
        // Hydrate invite into local store so redeemInvite can find it
        setRemoteInvite(dbInvite);
        useEventStore.setState((s) => {
          const exists = s.teamInvites.some((i) => i.id === dbInvite.id);
          if (exists) return {};
          return { teamInvites: [...s.teamInvites, dbInvite] };
        });
        // Also fetch the org name from Supabase if not in local store
        let name = organizations.find((o) => o.id === dbInvite.orgId)?.name;
        if (!name) {
          const { data: orgRow } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', dbInvite.orgId)
            .maybeSingle();
          name = orgRow?.name ?? 'Unknown Organization';
        }
        if (cancelled) return;
        applyInvite(dbInvite, name);
      })
      .catch(() => {
        if (!cancelled) setStatus('not-found');
      });
    return () => { cancelled = true; };

    function applyInvite(invite: NonNullable<typeof localInvite>, overrideName?: string) {
      if (invite.usedBy) {
        setStatus('used');
        return;
      }
      if (new Date(invite.expiresAt) < new Date()) {
        setStatus('expired');
        return;
      }
      const org = organizations.find((o) => o.id === invite.orgId);
      setOrgName(overrideName ?? org?.name ?? 'Unknown Organization');
      setStatus('ready');
    }
  }, [authLoading, user, inviteCode, findInviteByCode, organizations, navigate, setPendingInviteCode]);

  function handleJoin() {
    if (!inviteCode) return;
    const result = redeemInvite(inviteCode);
    if (result.success) {
      setStatus('success');
      // Redirect to dashboard after brief delay
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } else {
      if (result.error?.includes('already a member')) {
        setStatus('already-member');
      } else {
        setStatus('error');
        setErrorMessage(result.error ?? 'Something went wrong.');
      }
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
