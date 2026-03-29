import { cn } from '@/lib/utils';
import { useEventStore } from '@/data/store';
import {
  Send,
  Clock,
  CheckCheck,
  AlertTriangle,
  StickyNote,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';
import type { GuestMessageStatus } from '@/types/messaging';

interface GuestMessageHistoryProps {
  eventId: string;
  guestId?: string;
}

const statusConfig: Record<GuestMessageStatus, { icon: React.ReactNode; label: string; color: string }> = {
  queued: { icon: <Clock className="w-3 h-3" />, label: 'Queued', color: 'text-muted-foreground' },
  scheduled: { icon: <Clock className="w-3 h-3" />, label: 'Scheduled', color: 'text-blue-400' },
  sent: { icon: <Send className="w-3 h-3" />, label: 'Sent', color: 'text-emerald-400' },
  delivered: { icon: <CheckCheck className="w-3 h-3" />, label: 'Delivered', color: 'text-emerald-400' },
  bounced: { icon: <AlertTriangle className="w-3 h-3" />, label: 'Bounced', color: 'text-red-400' },
  failed: { icon: <AlertTriangle className="w-3 h-3" />, label: 'Failed', color: 'text-red-400' },
};

export function GuestMessageHistory({ eventId, guestId }: GuestMessageHistoryProps) {
  const messages = guestId
    ? useEventStore((s) => s.getGuestMessageHistory(guestId))
    : useEventStore((s) => s.getEventGuestMessages(eventId));
  const guests = useEventStore((s) => s.guests);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (messages.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <Send className="w-8 h-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">No messages sent yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      {messages.map((msg) => {
        const status = statusConfig[msg.status];
        const isExpanded = expandedId === msg.id;
        const recipientCount = msg.recipientGuestIds.length;
        const deliveredCount = msg.deliveryResults.filter((r) => r.status === 'delivered' || r.status === 'sent').length;
        const failedCount = msg.deliveryResults.filter((r) => r.status === 'bounced' || r.status === 'failed').length;

        return (
          <div
            key={msg.id}
            className={cn(
              'rounded-lg border p-3 transition-colors',
              msg.isNote
                ? 'border-amber-500/20 bg-amber-500/5'
                : 'border-border bg-card/50',
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  {msg.isNote ? (
                    <StickyNote className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <span className={cn('shrink-0', status.color)}>{status.icon}</span>
                  )}
                  <p className="text-[13px] font-medium text-foreground truncate">
                    {msg.subject || (msg.isNote ? 'Internal Note' : 'No subject')}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{msg.senderName}</span>
                  <span>
                    {new Date(msg.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                  {!msg.isNote && (
                    <span>
                      {deliveredCount}/{recipientCount} delivered
                      {failedCount > 0 && (
                        <span className="text-red-400 ml-1">({failedCount} failed)</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                className="shrink-0 p-1 rounded hover:bg-muted/30 transition-colors"
              >
                <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
              </button>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </p>

                {/* Recipient list */}
                {!guestId && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                      Recipients ({recipientCount})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {msg.recipientGuestIds.slice(0, 10).map((gid) => {
                        const guest = guests.find((g) => g.id === gid);
                        const result = msg.deliveryResults.find((r) => r.guestId === gid);
                        const rStatus = result ? statusConfig[result.status] : null;
                        return (
                          <span
                            key={gid}
                            className="inline-flex items-center gap-1 text-[10px] rounded-full border border-border bg-muted/20 px-2 py-0.5"
                          >
                            {guest?.displayName ?? gid}
                            {rStatus && <span className={rStatus.color}>{rStatus.icon}</span>}
                          </span>
                        );
                      })}
                      {recipientCount > 10 && (
                        <span className="text-[10px] text-muted-foreground px-2 py-0.5">
                          +{recipientCount - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
