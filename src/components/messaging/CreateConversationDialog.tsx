import { useState } from 'react';
import { useEventStore } from '@/data/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Hash, Lock, Users } from 'lucide-react';
import type { ConversationType, Conversation } from '@/types/messaging';
import { ROLE_CHANNEL_PRESETS } from '@/types/messaging';

interface CreateConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId?: string;
  onCreated: (conv: Conversation) => void;
}

const TYPES: { type: ConversationType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: 'dm', label: 'Direct Message', icon: <Lock className="w-4 h-4" />, desc: '1:1 private conversation' },
  { type: 'group', label: 'Group Chat', icon: <Users className="w-4 h-4" />, desc: 'Multi-person conversation' },
  { type: 'event_channel', label: 'Event Channel', icon: <Hash className="w-4 h-4" />, desc: 'Channel for a specific event' },
  { type: 'role_channel', label: 'Role Channel', icon: <Hash className="w-4 h-4" />, desc: 'Topic-based team channel' },
];

export function CreateConversationDialog({
  open,
  onOpenChange,
  eventId,
  onCreated,
}: CreateConversationDialogProps) {
  const userProfile = useEventStore((s) => s.userProfile);
  const accounts = useEventStore((s) => s.accounts);
  const activeOrgId = useEventStore((s) => s.activeOrgId);
  const addConversation = useEventStore((s) => s.addConversation);

  const [type, setType] = useState<ConversationType>('event_channel');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());

  const otherAccounts = accounts.filter((a) => a.id !== userProfile?.id);

  const toggleParticipant = (id: string) => {
    setSelectedParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = () => {
    if (!userProfile || !activeOrgId) return;

    const participantIds = [userProfile.id, ...selectedParticipants];
    const convName =
      name.trim() ||
      (type === 'role_channel' && selectedRole
        ? ROLE_CHANNEL_PRESETS.find((p) => p.role === selectedRole)?.name ?? selectedRole
        : type === 'dm' && selectedParticipants.size === 1
          ? (() => {
              const acct = accounts.find((a) => a.id === [...selectedParticipants][0]);
              return acct ? `${acct.firstName} ${acct.lastName}` : 'Direct Message';
            })()
          : 'New Conversation');

    const now = new Date().toISOString();
    const conv: Conversation = {
      id: `conv-${crypto.randomUUID().slice(0, 8)}`,
      orgId: activeOrgId,
      type,
      name: convName,
      description: description.trim() || undefined,
      eventId: type === 'event_channel' ? eventId : undefined,
      role: type === 'role_channel' ? selectedRole : undefined,
      participantIds,
      createdBy: userProfile.id,
      createdAt: now,
      updatedAt: now,
      pinnedMessageIds: [],
    };

    addConversation(conv);
    onCreated?.(conv);
    onOpenChange(false);

    // Reset form
    setName('');
    setDescription('');
    setSelectedRole('');
    setSelectedParticipants(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Type selector */}
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => setType(t.type)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  type === t.type
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-border hover:border-border/80 hover:bg-muted/30',
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={type === t.type ? 'text-violet-400' : 'text-muted-foreground'}>
                    {t.icon}
                  </span>
                  <span className="text-xs font-medium">{t.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{t.desc}</p>
              </button>
            ))}
          </div>

          {/* Role channel presets */}
          {type === 'role_channel' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Channel Topic
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_CHANNEL_PRESETS.map((preset) => (
                  <button
                    key={preset.role}
                    onClick={() => { setSelectedRole(preset.role); if (!name) setName(preset.name); }}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs border transition-colors',
                      selectedRole === preset.role
                        ? 'border-violet-500 bg-violet-500/15 text-violet-400'
                        : 'border-border text-muted-foreground hover:border-border/80',
                    )}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {type === 'dm' ? 'Name (optional)' : 'Channel Name'}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'dm' ? 'Auto-generated from participants' : 'e.g. General, Planning'}
              className="h-8 text-sm"
            />
          </div>

          {/* Description */}
          {(type === 'event_channel' || type === 'role_channel' || type === 'group') && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this channel about?"
                className="h-8 text-sm"
              />
            </div>
          )}

          {/* Participants */}
          {otherAccounts.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Participants
              </label>
              <div className="max-h-32 overflow-y-auto space-y-1 rounded-lg border border-border p-2">
                {otherAccounts.map((account) => (
                  <label
                    key={account.id}
                    className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/30 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedParticipants.has(account.id)}
                      onChange={() => toggleParticipant(account.id)}
                      className="rounded border-border"
                    />
                    <span className="text-xs">
                      {account.firstName} {account.lastName}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {account.role}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <Button onClick={handleCreate} className="w-full">
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
