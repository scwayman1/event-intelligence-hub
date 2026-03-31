import { useState } from 'react';
import { useEventStore } from '@/data/store';
import { useAuthContext } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Users, UserPlus, Copy, Check, Trash2, Shield, Eye, Link2, Clock, XCircle } from 'lucide-react';
import type { InviteRole, TeamInvite, OrgMember } from '@/types/events';

const INVITE_ROLE_OPTIONS: { value: InviteRole; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'coordinator', label: 'Coordinator', description: 'Can edit layout, guests, and seating', icon: <Users className="w-4 h-4" /> },
  { value: 'co-host', label: 'Co-host', description: 'Full access except deleting the event', icon: <Shield className="w-4 h-4" /> },
  { value: 'viewer', label: 'Viewer', description: 'Can view everything but not edit', icon: <Eye className="w-4 h-4" /> },
];

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  coordinator: 'Coordinator',
  'co-host': 'Co-host',
  viewer: 'Viewer',
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  owner: 'bg-primary/15 text-primary border-primary/30',
  coordinator: 'bg-accent/15 text-accent border-accent/30',
  'co-host': 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  viewer: 'bg-muted text-muted-foreground border-border',
};

export default function TeamManagement() {
  const { user } = useAuthContext();
  const activeOrgId = useEventStore((s) => s.activeOrgId);
  const organizations = useEventStore((s) => s.organizations);
  const accounts = useEventStore((s) => s.accounts);
  const getOrgMembers = useEventStore((s) => s.getOrgMembers);
  const getOrgInvites = useEventStore((s) => s.getOrgInvites);
  const createTeamInvite = useEventStore((s) => s.createTeamInvite);
  const revokeTeamInvite = useEventStore((s) => s.revokeTeamInvite);
  const removeOrgMember = useEventStore((s) => s.removeOrgMember);
  const userProfile = useEventStore((s) => s.userProfile);

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteRole, setInviteRole] = useState<InviteRole>('coordinator');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const activeOrg = organizations.find((o) => o.id === activeOrgId);
  const members = activeOrgId ? getOrgMembers(activeOrgId) : [];
  const invites = activeOrgId ? getOrgInvites(activeOrgId) : [];
  const pendingInvites = invites.filter((i) => !i.usedBy && new Date(i.expiresAt) > new Date());
  const currentUserMember = members.find((m) => m.userId === user?.id);
  const isOwner = currentUserMember?.role === 'owner';

  const selectClasses = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  function handleCreateInvite() {
    if (!activeOrgId) return;
    try {
      const invite = createTeamInvite(activeOrgId, inviteRole);
      const link = `${window.location.origin}/join/${invite.inviteCode}`;
      setGeneratedLink(link);
      setCopied(false);
    } catch {
      toast.error('Failed to create invite. Please try again.');
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(generatedLink).catch(() => {
      toast.error('Failed to copy to clipboard.');
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleRevokeInvite(inviteId: string) {
    revokeTeamInvite(inviteId);
  }

  function handleRemoveMember(memberId: string) {
    removeOrgMember(memberId);
    setConfirmRemove(null);
  }

  function getUserInfo(userId: string) {
    const account = accounts.find((a) => a.id === userId);
    if (account) {
      return { name: `${account.firstName} ${account.lastName}`, email: account.email };
    }
    // Fallback: check if it is the current user
    if (userProfile && userProfile.id === userId) {
      return { name: `${userProfile.firstName} ${userProfile.lastName}`, email: userProfile.email };
    }
    return { name: 'Unknown User', email: '' };
  }

  function formatExpiry(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
  }

  if (!activeOrg) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Select an organization to manage your team.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage members of <span className="font-medium text-foreground">{activeOrg.name}</span>
          </p>
        </div>
        {isOwner && (
          <Button onClick={() => { setShowInviteDialog(true); setGeneratedLink(''); }} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Members list */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Members ({members.length})
        </h2>
        {members.length === 0 ? (
          <div className="glass-panel p-6 text-center text-sm text-muted-foreground">
            No team members yet. Invite someone to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((member) => {
              const info = getUserInfo(member.userId);
              const isSelf = member.userId === user?.id;
              return (
                <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {info.name.split(' ').map((n) => n.charAt(0)).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {info.name}
                      {isSelf && <span className="text-xs text-muted-foreground ml-1.5">(you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{info.email}</p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${ROLE_BADGE_COLORS[member.role] ?? ROLE_BADGE_COLORS.viewer}`}>
                    {ROLE_LABELS[member.role] ?? member.role}
                  </span>
                  {isOwner && !isSelf && member.role !== 'owner' && (
                    <>
                      {confirmRemove === member.id ? (
                        <div className="flex items-center gap-1">
                          <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => handleRemoveMember(member.id)}>
                            Remove
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmRemove(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove(member.id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending invites */}
      {isOwner && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pending Invites ({pendingInvites.length})
          </h2>
          {pendingInvites.length === 0 ? (
            <div className="glass-panel p-4 text-center text-sm text-muted-foreground">
              No pending invites.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                  <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Link2 className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Invite Link</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      /join/{invite.inviteCode.slice(0, 8)}...
                    </p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${ROLE_BADGE_COLORS[invite.role]}`}>
                    {ROLE_LABELS[invite.role]}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatExpiry(invite.expiresAt)}
                  </span>
                  <button
                    onClick={() => handleRevokeInvite(invite.id)}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Revoke invite"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Generate a shareable link. Anyone with the link can join your organization.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!generatedLink ? (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Role</Label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as InviteRole)}
                    className={selectClasses}
                  >
                    {INVITE_ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label} -- {r.description}</option>
                    ))}
                  </select>
                </div>

                <div className="rounded-md bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
                  <p>The invite link will:</p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    <li>Be valid for 7 days</li>
                    <li>Work for one person (single use)</li>
                    <li>Can be revoked at any time</li>
                  </ul>
                </div>

                <Button onClick={handleCreateInvite} className="w-full gap-2">
                  <Link2 className="w-4 h-4" />
                  Generate Invite Link
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Share this link</Label>
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-mono text-foreground truncate select-all">
                      {generatedLink}
                    </div>
                    <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  {copied && (
                    <p className="text-xs text-green-600 font-medium">Copied to clipboard!</p>
                  )}
                </div>

                <div className="rounded-md bg-muted/50 border border-border p-3 text-xs text-muted-foreground">
                  Send this link via email, Slack, text, or any other way. The recipient will need to sign up or sign in to accept the invite.
                </div>

                <Button variant="outline" onClick={() => { setGeneratedLink(''); }} className="w-full">
                  Generate Another Link
                </Button>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowInviteDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
