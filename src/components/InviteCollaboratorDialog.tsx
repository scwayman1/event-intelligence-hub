import { useState } from 'react';
import { useEventStore } from '@/data/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Trash2, Shield, Eye, Users } from 'lucide-react';
import type { CollaboratorRole } from '@/types/events';

const roleOptions: { value: CollaboratorRole; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'coordinator', label: 'Coordinator', description: 'Can edit layout, guests, and seating', icon: <Users className="w-4 h-4" /> },
  { value: 'co-host', label: 'Co-host', description: 'Full access except deleting the event', icon: <Shield className="w-4 h-4" /> },
  { value: 'viewer', label: 'Viewer', description: 'Can view everything but not edit', icon: <Eye className="w-4 h-4" /> },
];

interface InviteCollaboratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
}

export function InviteCollaboratorDialog({ open, onOpenChange, eventId }: InviteCollaboratorDialogProps) {
  const userProfile = useEventStore((s) => s.userProfile);
  const addCollaborator = useEventStore((s) => s.addCollaborator);
  const removeCollaborator = useEventStore((s) => s.removeCollaborator);
  const getEventCollaborators = useEventStore((s) => s.getEventCollaborators);
  const collaborators = getEventCollaborators(eventId);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CollaboratorRole>('coordinator');

  const selectClasses = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  function handleInvite() {
    if (!name.trim() || !email.trim() || !userProfile) return;

    addCollaborator({
      id: `collab-${crypto.randomUUID().slice(0, 8)}`,
      eventId,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role,
      invitedBy: userProfile.id,
      invitedAt: new Date().toISOString(),
      status: 'pending',
    });

    setName('');
    setEmail('');
    setRole('coordinator');
  }

  const roleLabels: Record<CollaboratorRole, string> = {
    owner: 'Owner',
    coordinator: 'Coordinator',
    'co-host': 'Co-host',
    viewer: 'Viewer',
  };

  const roleBadgeColors: Record<CollaboratorRole, string> = {
    owner: 'bg-primary/15 text-primary border-primary/30',
    coordinator: 'bg-accent/15 text-accent border-accent/30',
    'co-host': 'bg-info/15 text-info border-info/30',
    viewer: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Team & collaborators</DialogTitle>
          <DialogDescription>
            Invite others to collaborate on this event as coordinators, co-hosts, or viewers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Current user as owner */}
          {userProfile && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Owner</p>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {userProfile.firstName.charAt(0)}{userProfile.lastName.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{userProfile.firstName} {userProfile.lastName}</p>
                  <p className="text-xs text-muted-foreground truncate">{userProfile.email}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${roleBadgeColors.owner}`}>
                  Owner
                </span>
              </div>
            </div>
          )}

          {/* Existing collaborators */}
          {collaborators.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Collaborators ({collaborators.length})
              </p>
              <div className="space-y-2">
                {collaborators.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-muted-foreground">
                        {c.name.split(' ').map((n) => n.charAt(0)).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${roleBadgeColors[c.role]}`}>
                      {roleLabels[c.role]}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.status === 'pending' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>
                      {c.status}
                    </span>
                    <button
                      onClick={() => removeCollaborator(c.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invite form */}
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invite someone</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="collab-name" className="text-xs">Name</Label>
                <Input
                  id="collab-name"
                  placeholder="Alex Johnson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="collab-email" className="text-xs">Email</Label>
                <Input
                  id="collab-email"
                  type="email"
                  placeholder="alex@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="collab-role" className="text-xs">Role</Label>
              <select
                id="collab-role"
                value={role}
                onChange={(e) => setRole(e.target.value as CollaboratorRole)}
                className={selectClasses}
              >
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>{r.label} — {r.description}</option>
                ))}
              </select>
            </div>

            <Button onClick={handleInvite} disabled={!name.trim() || !email.trim()} size="sm" className="gap-2">
              <UserPlus className="w-3.5 h-3.5" />
              Send invite
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
