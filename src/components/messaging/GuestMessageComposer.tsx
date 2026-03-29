import { useState, useMemo } from 'react';
import { useEventStore } from '@/data/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Send,
  Clock,
  FileText,
  Users,
  Filter,
  StickyNote,
} from 'lucide-react';
import type { GuestMessage, GuestMessageStatus, MessageTemplate } from '@/types/messaging';
import { DEFAULT_TEMPLATES } from '@/types/messaging';
import { toast } from 'sonner';

interface GuestMessageComposerProps {
  eventId: string;
}

type RecipientMode = 'individual' | 'segment' | 'all';

const SEGMENTS = [
  { key: 'confirmed', label: 'Confirmed guests' },
  { key: 'invited', label: 'Invited (no RSVP)' },
  { key: 'donors', label: 'Donors' },
  { key: 'scholarship_recipients', label: 'Scholarship recipients' },
  { key: 'vip', label: 'VIP guests' },
  { key: 'declined', label: 'Declined' },
] as const;

export function GuestMessageComposer({ eventId }: GuestMessageComposerProps) {
  const userProfile = useEventStore((s) => s.userProfile);
  const guests = useEventStore((s) => s.getEventGuests(eventId));
  const addGuestMessage = useEventStore((s) => s.addGuestMessage);
  const messageTemplates = useEventStore((s) => s.messageTemplates);
  const addMessageTemplate = useEventStore((s) => s.addMessageTemplate);
  const activeOrgId = useEventStore((s) => s.activeOrgId);

  const [recipientMode, setRecipientMode] = useState<RecipientMode>('segment');
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [selectedSegment, setSelectedSegment] = useState('confirmed');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [guestSearch, setGuestSearch] = useState('');

  // Ensure default templates exist
  const allTemplates = useMemo(() => {
    if (messageTemplates.length > 0) return messageTemplates;
    // Seed defaults
    const now = new Date().toISOString();
    const seeded: MessageTemplate[] = DEFAULT_TEMPLATES.map((t, i) => ({
      ...t,
      id: `tmpl-${i}`,
      orgId: activeOrgId ?? '',
      createdBy: userProfile?.id ?? '',
      createdAt: now,
      updatedAt: now,
    }));
    seeded.forEach((t) => addMessageTemplate(t));
    return seeded;
  }, [messageTemplates, activeOrgId, userProfile?.id, addMessageTemplate]);

  // Resolve recipients
  const resolvedRecipients = useMemo(() => {
    if (recipientMode === 'all') return guests;
    if (recipientMode === 'individual') return guests.filter((g) => selectedGuestIds.has(g.id));
    // Segment
    switch (selectedSegment) {
      case 'confirmed': return guests.filter((g) => g.rsvpStatus === 'confirmed');
      case 'invited': return guests.filter((g) => g.rsvpStatus === 'invited');
      case 'donors': return guests.filter((g) => g.category === 'donor');
      case 'scholarship_recipients': return guests.filter((g) => g.category === 'scholarship_recipient');
      case 'vip': return guests.filter((g) => g.category === 'vip');
      case 'declined': return guests.filter((g) => g.rsvpStatus === 'declined');
      default: return [];
    }
  }, [recipientMode, guests, selectedGuestIds, selectedSegment]);

  const filteredGuests = guestSearch.trim()
    ? guests.filter((g) =>
        `${g.firstName} ${g.lastName} ${g.email}`.toLowerCase().includes(guestSearch.toLowerCase()),
      )
    : guests;

  const applyTemplate = (tmpl: MessageTemplate) => {
    setSubject(tmpl.subject);
    setContent(tmpl.content);
  };

  const handleSend = () => {
    if (!userProfile || !activeOrgId) return;
    if (resolvedRecipients.length === 0) {
      toast.error('No recipients selected');
      return;
    }
    if (!content.trim()) {
      toast.error('Message content is required');
      return;
    }

    const now = new Date().toISOString();
    const status: GuestMessageStatus = isScheduled && scheduledDate ? 'scheduled' : 'sent';

    const msg: GuestMessage = {
      id: `gmsg-${crypto.randomUUID().slice(0, 8)}`,
      orgId: activeOrgId,
      eventId,
      senderId: userProfile.id,
      senderName: `${userProfile.firstName} ${userProfile.lastName}`,
      recipientGuestIds: resolvedRecipients.map((g) => g.id),
      subject: subject.trim(),
      content: content.trim(),
      scheduledAt: isScheduled && scheduledDate ? new Date(scheduledDate).toISOString() : undefined,
      sentAt: status === 'sent' ? now : undefined,
      status,
      deliveryResults: resolvedRecipients.map((g) => ({
        guestId: g.id,
        status: status === 'sent' ? 'delivered' as GuestMessageStatus : 'queued' as GuestMessageStatus,
        sentAt: status === 'sent' ? now : undefined,
      })),
      isNote,
      createdAt: now,
    };

    addGuestMessage(msg);
    toast.success(
      isNote
        ? `Internal note added for ${resolvedRecipients.length} guest${resolvedRecipients.length !== 1 ? 's' : ''}`
        : `Message ${status === 'scheduled' ? 'scheduled' : 'sent'} to ${resolvedRecipients.length} guest${resolvedRecipients.length !== 1 ? 's' : ''}`,
    );

    setSubject('');
    setContent('');
    setIsScheduled(false);
    setScheduledDate('');
  };

  return (
    <div className="space-y-4 p-4">
      {/* Internal note toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setIsNote(false)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            !isNote ? 'border-violet-500 bg-violet-500/10 text-violet-400' : 'border-border text-muted-foreground',
          )}
        >
          <Send className="w-3 h-3" /> Guest Message
        </button>
        <button
          onClick={() => setIsNote(true)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            isNote ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-border text-muted-foreground',
          )}
        >
          <StickyNote className="w-3 h-3" /> Internal Note
        </button>
      </div>

      {/* Recipient mode */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Recipients</label>
        <div className="flex gap-1.5 mb-2">
          {([
            { mode: 'segment' as RecipientMode, icon: <Filter className="w-3 h-3" />, label: 'By Segment' },
            { mode: 'individual' as RecipientMode, icon: <Users className="w-3 h-3" />, label: 'Individual' },
            { mode: 'all' as RecipientMode, icon: <Users className="w-3 h-3" />, label: 'All Guests' },
          ]).map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => setRecipientMode(mode)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                recipientMode === mode
                  ? 'border-violet-500/50 bg-violet-500/10 text-violet-400'
                  : 'border-border text-muted-foreground hover:bg-muted/30',
              )}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Segment selector */}
        {recipientMode === 'segment' && (
          <div className="flex flex-wrap gap-1.5">
            {SEGMENTS.map((seg) => (
              <button
                key={seg.key}
                onClick={() => setSelectedSegment(seg.key)}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] border transition-colors',
                  selectedSegment === seg.key
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-border text-muted-foreground hover:bg-muted/30',
                )}
              >
                {seg.label}
              </button>
            ))}
          </div>
        )}

        {/* Individual guest picker */}
        {recipientMode === 'individual' && (
          <div className="space-y-2">
            <Input
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              placeholder="Search guests..."
              className="h-7 text-xs"
            />
            <div className="max-h-32 overflow-y-auto border border-border rounded-lg p-1.5 space-y-0.5">
              {filteredGuests.slice(0, 20).map((g) => (
                <label key={g.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGuestIds.has(g.id)}
                    onChange={() => {
                      setSelectedGuestIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.id)) next.delete(g.id);
                        else next.add(g.id);
                        return next;
                      });
                    }}
                    className="rounded border-border"
                  />
                  <span className="text-xs truncate">{g.displayName}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{g.category}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground mt-1.5">
          {resolvedRecipients.length} recipient{resolvedRecipients.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      {/* Template selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Template</label>
        <div className="flex gap-1.5 flex-wrap">
          {allTemplates.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => applyTemplate(tmpl)}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
            >
              <FileText className="w-3 h-3" /> {tmpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Subject</label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Message subject..."
          className="h-8 text-sm"
        />
      </div>

      {/* Content */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Message</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your message..."
          rows={6}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Use {'{{firstName}}'}, {'{{lastName}}'}, {'{{eventName}}'} for personalization.
        </p>
      </div>

      {/* Schedule */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isScheduled}
            onChange={(e) => setIsScheduled(e.target.checked)}
            className="rounded border-border"
          />
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Schedule send</span>
        </label>
        {isScheduled && (
          <Input
            type="datetime-local"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="h-7 text-xs w-auto"
          />
        )}
      </div>

      {/* Send */}
      <Button onClick={handleSend} className="w-full gap-2">
        {isNote ? (
          <><StickyNote className="w-4 h-4" /> Save Note</>
        ) : isScheduled ? (
          <><Clock className="w-4 h-4" /> Schedule Message</>
        ) : (
          <><Send className="w-4 h-4" /> Send to {resolvedRecipients.length} Guest{resolvedRecipients.length !== 1 ? 's' : ''}</>
        )}
      </Button>
    </div>
  );
}
