/**
 * TableHoverCard — Liquid glass popover for table details on hover.
 *
 * Shows all guests at a table with key info, relationship groups,
 * and Franck's seating reasoning (when AI-assisted).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Users,
  Utensils,
  Accessibility,
  Sparkles,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Guest,
  LayoutObject,
  GuestCategory,
  RSVPStatus,
  RelationshipGroup,
  RelationshipMembership,
} from '@/types/events';
import { RELATIONSHIP_TYPE_COLORS } from '@/types/events';

// ─── Style Maps ─────────────────────────────────────────────────────────────

const categoryBadge: Record<GuestCategory, { label: string; bg: string; text: string }> = {
  donor:                { label: 'Donor',   bg: 'rgba(245,158,11,0.15)', text: 'rgb(217,119,6)' },
  scholarship_recipient:{ label: 'Scholar', bg: 'rgba(139,92,246,0.15)', text: 'rgb(124,58,237)' },
  family:               { label: 'Family',  bg: 'rgba(244,63,94,0.12)', text: 'rgb(225,29,72)' },
  board_member:         { label: 'Board',   bg: 'rgba(99,102,241,0.15)', text: 'rgb(79,70,229)' },
  vip:                  { label: 'VIP',     bg: 'rgba(234,179,8,0.15)', text: 'rgb(161,98,7)' },
  staff:                { label: 'Staff',   bg: 'rgba(14,165,233,0.12)', text: 'rgb(2,132,199)' },
  sponsor:              { label: 'Sponsor', bg: 'rgba(16,185,129,0.15)', text: 'rgb(5,150,105)' },
  volunteer:            { label: 'Volunteer',bg:'rgba(20,184,166,0.12)', text: 'rgb(13,148,136)' },
  other:                { label: 'Guest',   bg: 'rgba(120,113,108,0.12)',text: 'rgb(87,83,78)' },
};

const rsvpDot: Record<RSVPStatus, string> = {
  confirmed: '#22c55e',
  checked_in: '#3b82f6',
  invited: '#eab308',
  declined: '#f87171',
  waitlist: '#fb923c',
};

const rsvpLabel: Record<RSVPStatus, string> = {
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  invited: 'Invited',
  declined: 'Declined',
  waitlist: 'Waitlist',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface TableHoverCardProps {
  table: LayoutObject;
  guests: Guest[];
  relationshipGroups: RelationshipGroup[];
  relationshipMemberships: RelationshipMembership[];
  children: React.ReactNode;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TableHoverCard({
  table,
  guests,
  relationshipGroups,
  relationshipMemberships,
  children,
}: TableHoverCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const [leftOffset, setLeftOffset] = useState<number | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const enterTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const capacity = Math.max(table.capacity, 1);
  const cardWidth = 340;

  // Build relationship map for this table's guests
  const tableGuestIds = new Set(guests.map((g) => g.id));

  // Find groups represented at this table
  const groupsAtTable = (() => {
    const groupMap = new Map<string, { group: RelationshipGroup; members: { guest: Guest; role: string }[] }>();
    for (const m of relationshipMemberships) {
      if (!tableGuestIds.has(m.guestId)) continue;
      const guest = guests.find((g) => g.id === m.guestId);
      const group = relationshipGroups.find((g) => g.id === m.groupId);
      if (!guest || !group) continue;
      if (!groupMap.has(group.id)) {
        groupMap.set(group.id, { group, members: [] });
      }
      groupMap.get(group.id)!.members.push({ guest, role: m.role });
    }
    return Array.from(groupMap.values());
  })();

  // Position calculation
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;
    setPosition(spaceBelow < 360 ? 'top' : 'bottom');

    // Calculate horizontal offset to keep card within viewport
    const triggerCenterX = rect.left + rect.width / 2;
    const halfCard = cardWidth / 2;
    const padding = 16;
    if (triggerCenterX - halfCard < padding) {
      // Overflows left: shift right
      setLeftOffset(padding - (triggerCenterX - halfCard));
    } else if (triggerCenterX + halfCard > window.innerWidth - padding) {
      // Overflows right: shift left
      setLeftOffset(window.innerWidth - padding - (triggerCenterX + halfCard));
    } else {
      setLeftOffset(null);
    }
  }, []);

  const handleEnter = useCallback(() => {
    if (leaveTimeout.current) {
      clearTimeout(leaveTimeout.current);
      leaveTimeout.current = null;
    }
    enterTimeout.current = setTimeout(() => {
      updatePosition();
      setIsVisible(true);
    }, 250);
  }, [updatePosition]);

  const handleLeave = useCallback(() => {
    if (enterTimeout.current) {
      clearTimeout(enterTimeout.current);
      enterTimeout.current = null;
    }
    leaveTimeout.current = setTimeout(() => {
      setIsVisible(false);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (enterTimeout.current) clearTimeout(enterTimeout.current);
      if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
    };
  }, []);

  return (
    <div
      ref={triggerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}

      {/* Liquid Glass Card */}
      <div
        ref={cardRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className={cn(
          'absolute z-[100] w-[340px] max-h-[420px]',
          leftOffset == null && 'left-1/2 -translate-x-1/2',
          position === 'bottom' ? 'top-full mt-3' : 'bottom-full mb-3',
          // Liquid glass styling
          'rounded-2xl overflow-hidden',
          'border border-white/[0.12]',
          'shadow-[0_8px_40px_rgba(0,0,0,0.25),0_2px_12px_rgba(0,0,0,0.15)]',
          // Transitions
          'transition-all duration-200 ease-out origin-top',
          isVisible
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-[0.97] pointer-events-none',
          position === 'bottom'
            ? isVisible ? 'translate-y-0' : 'translate-y-2'
            : isVisible ? 'translate-y-0' : '-translate-y-2',
        )}
        style={{
          backdropFilter: 'blur(24px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
          ...(leftOffset != null ? { left: '50%', transform: `translateX(calc(-50% + ${leftOffset}px))` } : {}),
        }}
      >
        {/* Inner glow border */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 50%, rgba(255,255,255,0.02) 100%)',
          }}
        />

        <div className="relative overflow-y-auto max-h-[420px] p-4 space-y-3">
          {/* ── Header ───────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {table.tableNumber != null && (
                <span
                  className="inline-flex items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
                  style={{
                    width: 20,
                    height: 20,
                    background: 'linear-gradient(135deg, hsl(152 68% 42%), hsl(152 55% 36%))',
                  }}
                >
                  {table.tableNumber}
                </span>
              )}
              <h3 className="text-sm font-bold text-foreground tracking-tight">
                {table.name}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                {guests.length}/{capacity}
              </div>
              {/* Fill indicator dots */}
              <div className="flex gap-0.5 ml-1">
                {Array.from({ length: capacity }, (_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-colors',
                      i < guests.length ? 'bg-emerald-400' : 'bg-muted-foreground/20'
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Relationship Groups ──────────────────────────────── */}
          {groupsAtTable.length > 0 && (
            <div className="space-y-1.5">
              {groupsAtTable.map(({ group, members }) => {
                const color = group.color ?? RELATIONSHIP_TYPE_COLORS[group.type];
                return (
                  <div
                    key={group.id}
                    className="rounded-lg px-2.5 py-1.5"
                    style={{
                      background: `${color}12`,
                      border: `1px solid ${color}25`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Link2 className="w-3 h-3 flex-shrink-0" style={{ color }} />
                      <span className="text-[11px] font-semibold" style={{ color }}>
                        {group.name}
                      </span>
                      <span className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider ml-auto">
                        {group.type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      {members.map(({ guest, role }) => (
                        <span key={guest.id} className="text-[10px] text-muted-foreground">
                          {guest.firstName} <span className="text-muted-foreground/50">({role})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Guest List ───────────────────────────────────────── */}
          {guests.length > 0 ? (
            <div className="space-y-1">
              {guests.map((guest) => {
                const normalizedCategory = (guest.category?.toLowerCase().replace(/\s+/g, '_') ?? 'other') as GuestCategory;
                const cat = categoryBadge[normalizedCategory] ?? categoryBadge.other;
                const dot = rsvpDot[guest.rsvpStatus] ?? rsvpDot.invited;
                const label = rsvpLabel[guest.rsvpStatus] ?? 'Unknown';

                // Find this guest's relationship memberships at this table
                const guestMemberships = relationshipMemberships.filter(
                  (m) => m.guestId === guest.id
                );
                const guestGroups = guestMemberships
                  .map((m) => relationshipGroups.find((g) => g.id === m.groupId))
                  .filter(Boolean) as RelationshipGroup[];

                return (
                  <div
                    key={guest.id}
                    className={cn(
                      'rounded-xl px-3 py-2 transition-colors',
                      'hover:bg-white/[0.06]',
                    )}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {/* Row 1: Name + category */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* RSVP dot */}
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: dot }}
                          title={label}
                        />
                        <span className="text-[12px] font-medium text-foreground truncate">
                          {guest.displayName}
                        </span>
                      </div>
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 flex-shrink-0"
                        style={{ background: cat.bg, color: cat.text }}
                      >
                        {cat.label}
                      </span>
                    </div>

                    {/* Row 2: Organization + details */}
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      {guest.organization && (
                        <span className="truncate">{guest.organization}</span>
                      )}
                      {guest.partySize > 1 && (
                        <span className="flex items-center gap-0.5 flex-shrink-0">
                          <Users className="w-2.5 h-2.5" /> +{guest.partySize - 1}
                        </span>
                      )}
                      {guest.dietaryRestrictions && (
                        <span className="flex items-center gap-0.5 flex-shrink-0" title={guest.dietaryRestrictions}>
                          <Utensils className="w-2.5 h-2.5 text-orange-400" />
                        </span>
                      )}
                      {guest.accessibilityNeeds && (
                        <span className="flex items-center gap-0.5 flex-shrink-0" title={guest.accessibilityNeeds}>
                          <Accessibility className="w-2.5 h-2.5 text-blue-400" />
                        </span>
                      )}
                    </div>

                    {/* Row 3: Relationship group badges (inline) */}
                    {guestGroups.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {guestGroups.map((g) => {
                          const c = g.color ?? RELATIONSHIP_TYPE_COLORS[g.type] ?? 'hsl(200 15% 55%)';
                          const role = guestMemberships.find((m) => m.groupId === g.id)?.role;
                          return (
                            <span
                              key={g.id}
                              className="inline-flex items-center gap-0.5 text-[9px] font-medium rounded-full px-1.5 py-0.5"
                              style={{ background: `${c}18`, color: c, border: `1px solid ${c}30` }}
                            >
                              <Link2 className="w-2 h-2" />
                              {role ?? g.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/60 text-center py-3 italic">
              No guests assigned yet
            </p>
          )}

          {/* ── AI Seating Note (if anchored group exists) ──────── */}
          {groupsAtTable.length > 0 && (
            <div
              className="rounded-lg px-3 py-2 flex items-start gap-2"
              style={{
                background: 'rgba(139,92,246,0.08)',
                border: '1px solid rgba(139,92,246,0.15)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-violet-300/90 leading-relaxed">
                {groupsAtTable.length === 1
                  ? `Seated together as ${groupsAtTable[0].group.type.replace('_', ' ')} group "${groupsAtTable[0].group.name}" — ${groupsAtTable[0].members.map((m) => m.role).filter((v, i, a) => a.indexOf(v) === i).join(' + ')}.`
                  : `${groupsAtTable.length} relationship groups intersect at this table: ${groupsAtTable.map((g) => g.group.name).join(', ')}.`}
              </p>
            </div>
          )}

          {/* ── Table notes ──────────────────────────────────────── */}
          {table.notes && (
            <p className="text-[10px] text-muted-foreground/50 italic px-1">
              {table.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
