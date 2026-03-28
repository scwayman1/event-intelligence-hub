import { useState } from 'react';
import { cn } from '@/lib/utils';
import { RelationshipBadge } from '@/components/RelationshipBadge';
import type { Guest, RelationshipGroup, RelationshipMembership, RSVPStatus } from '@/types/events';

interface GuestDragCardProps {
  guest: Guest;
  relationships: Array<{ group: RelationshipGroup; membership: RelationshipMembership }>;
  isAssigned?: boolean;
  /** When set, the card glows/pulses with this color to indicate a seated group match */
  matchColor?: string;
  /** Name of the matched relationship group */
  matchGroupName?: string;
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

export function GuestDragCard({
  guest,
  relationships,
  isAssigned = false,
  matchColor,
  matchGroupName,
}: GuestDragCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('guestId', guest.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const plusN = guest.partySize > 1 ? guest.partySize - 1 : 0;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={cn(
        'rounded-lg border bg-card p-2.5 select-none transition-all duration-300 ease-in-out',
        'hover:border-primary/40 hover:bg-card/80',
        isDragging
          ? 'opacity-50 cursor-grabbing shadow-lg ring-1 ring-primary/40'
          : 'cursor-grab opacity-100',
        isAssigned && 'opacity-60',
        matchColor && 'match-pulse',
      )}
      style={matchColor ? {
        borderColor: `${matchColor}60`,
        borderLeftWidth: 3,
        borderLeftColor: matchColor,
        boxShadow: `0 0 12px ${matchColor}20, 0 0 4px ${matchColor}15`,
        background: `linear-gradient(90deg, ${matchColor}08 0%, transparent 40%)`,
      } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {/* Match dot */}
            {matchColor && (
              <span
                className="shrink-0 w-2 h-2 rounded-full match-pulse-dot"
                style={{ backgroundColor: matchColor }}
              />
            )}
            <p className="text-sm font-medium text-foreground truncate leading-tight">
              {guest.displayName}
            </p>
            {/* Plus-one badge */}
            {plusN > 0 && (
              <span
                className={cn(
                  'shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                  'bg-violet-500/20 text-violet-300 border border-violet-500/30',
                  'backdrop-blur-sm',
                )}
              >
                +{plusN}
              </span>
            )}
          </div>
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

      {/* Match group tag */}
      {matchColor && matchGroupName && (
        <div className="mt-1">
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border backdrop-blur-sm"
            style={{
              color: matchColor,
              borderColor: `${matchColor}40`,
              backgroundColor: `${matchColor}15`,
            }}
          >
            {matchGroupName}
          </span>
        </div>
      )}

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

      {/* Inline keyframe styles for match pulse animation */}
      {matchColor && (
        <style>{`
          .match-pulse {
            animation: matchPulse 2.5s ease-in-out infinite;
          }
          .match-pulse-dot {
            animation: matchDotPulse 2s ease-in-out infinite;
          }
          @keyframes matchPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.02); }
          }
          @keyframes matchDotPulse {
            0%, 100% { opacity: 0.7; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.2); }
          }
        `}</style>
      )}
    </div>
  );
}
