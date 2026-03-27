import { useState } from 'react';
import { cn } from '@/lib/utils';
import { RelationshipBadge } from '@/components/RelationshipBadge';
import type { Guest, RelationshipGroup, RelationshipMembership, RSVPStatus } from '@/types/events';

interface GuestDragCardProps {
  guest: Guest;
  relationships: Array<{ group: RelationshipGroup; membership: RelationshipMembership }>;
  isAssigned?: boolean;
}

const rsvpBadgeStyles: Record<RSVPStatus, string> = {
  confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
  invited: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  waitlist: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  declined: 'bg-red-500/20 text-red-400 border-red-500/30',
  checked_in: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const rsvpLabels: Record<RSVPStatus, string> = {
  confirmed: 'Confirmed',
  invited: 'Invited',
  waitlist: 'Waitlist',
  declined: 'Declined',
  checked_in: 'Checked in',
};

export function GuestDragCard({ guest, relationships, isAssigned = false }: GuestDragCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('guestId', guest.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={cn(
        'rounded-lg border border-border bg-card p-2.5 select-none transition-all',
        'hover:border-primary/40 hover:bg-card/80',
        isDragging
          ? 'opacity-50 cursor-grabbing shadow-lg ring-1 ring-primary/40'
          : 'cursor-grab opacity-100',
        isAssigned && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate leading-tight">
            {guest.displayName}
          </p>
          {guest.organization && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {guest.organization}
            </p>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
            rsvpBadgeStyles[guest.rsvpStatus],
          )}
        >
          {rsvpLabels[guest.rsvpStatus]}
        </span>
      </div>

      {relationships.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {relationships.map(({ group, membership }) => (
            <RelationshipBadge
              key={membership.id}
              group={group}
              role={membership.role}
            />
          ))}
        </div>
      )}
    </div>
  );
}
