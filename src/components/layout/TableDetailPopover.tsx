import type { Guest, LayoutObject, GuestCategory, RSVPStatus, RelationshipGroup, RelationshipMembership } from '@/types/events';
import { RELATIONSHIP_TYPE_COLORS } from '@/types/events';
import { cn } from '@/lib/utils';
import { Users, Utensils, Accessibility, Tag, Building2, Mail, Phone, Link2 } from 'lucide-react';

const categoryStyles: Record<GuestCategory, { label: string; color: string }> = {
  donor: { label: 'Donor', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  scholarship_recipient: { label: 'Scholar', color: 'bg-violet-100 text-violet-800 border-violet-300' },
  family: { label: 'Family', color: 'bg-rose-100 text-rose-800 border-rose-300' },
  board_member: { label: 'Board', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  vip: { label: 'VIP', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  staff: { label: 'Staff', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  sponsor: { label: 'Sponsor', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  volunteer: { label: 'Volunteer', color: 'bg-teal-100 text-teal-800 border-teal-300' },
  dignitary: { label: 'Dignitary', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  other: { label: 'Guest', color: 'bg-stone-100 text-stone-700 border-stone-300' },
};

const rsvpStyles: Record<RSVPStatus, { label: string; dot: string }> = {
  confirmed: { label: 'Confirmed', dot: 'bg-green-500' },
  checked_in: { label: 'Checked In', dot: 'bg-blue-500' },
  invited: { label: 'Invited', dot: 'bg-yellow-500' },
  declined: { label: 'Declined', dot: 'bg-red-400' },
  waitlist: { label: 'Waitlist', dot: 'bg-orange-400' },
};

interface TableDetailPopoverProps {
  table: LayoutObject;
  guests: Guest[];
  capacity: number;
  relationshipGroups: RelationshipGroup[];
  relationshipMemberships: RelationshipMembership[];
}

export function TableDetailPopover({ table, guests, capacity, relationshipGroups, relationshipMemberships }: TableDetailPopoverProps) {
  const openSeats = capacity - guests.length;

  // Build per-guest relationship group lookup
  const guestGroupMap = new Map<string, { group: RelationshipGroup; role: string }[]>();
  for (const m of relationshipMemberships) {
    const group = relationshipGroups.find((g) => g.id === m.groupId);
    if (!group) continue;
    if (!guestGroupMap.has(m.guestId)) {
      guestGroupMap.set(m.guestId, []);
    }
    guestGroupMap.get(m.guestId)!.push({ group, role: m.role });
  }

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{table.name}</h4>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span className="font-mono">{guests.length}/{capacity}</span>
        </div>
      </div>

      {/* Seat fill bar */}
      <div className="space-y-1">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              guests.length === capacity ? 'bg-emerald-500' : guests.length > 0 ? 'bg-amber-400' : 'bg-muted-foreground/20',
            )}
            style={{ width: `${capacity > 0 ? (guests.length / capacity) * 100 : 0}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {guests.length === 0
            ? 'No guests assigned yet'
            : openSeats > 0
              ? `${openSeats} open seat${openSeats !== 1 ? 's' : ''} remaining`
              : 'Table is full'}
        </p>
      </div>

      {/* Guest list */}
      {guests.length > 0 && (
        <div className="space-y-1.5">
          {guests.map((guest) => {
            const normalizedCat = (guest.category?.toLowerCase().replace(/\s+/g, '_') ?? 'other') as GuestCategory;
            const cat = categoryStyles[normalizedCat] ?? categoryStyles.other;
            const normalizedRsvp = (guest.rsvpStatus?.toLowerCase().replace(/\s+/g, '_') ?? 'invited') as RSVPStatus;
            const rsvp = rsvpStyles[normalizedRsvp] ?? rsvpStyles.invited;
            return (
              <div
                key={guest.id}
                className="rounded-lg border border-border/70 bg-card/80 px-2.5 py-2 space-y-1.5"
              >
                {/* Name + category badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{guest.displayName}</p>
                    {guest.organization && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{guest.organization}</span>
                      </p>
                    )}
                  </div>
                  <span className={cn('text-[10px] font-medium border rounded-full px-1.5 py-0.5 whitespace-nowrap flex-shrink-0', cat.color)}>
                    {cat.label}
                  </span>
                </div>

                {/* RSVP status + party size */}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className={cn('w-1.5 h-1.5 rounded-full', rsvp.dot)} />
                    {rsvp.label}
                  </span>
                  {guest.partySize > 1 && (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> Party of {guest.partySize}
                    </span>
                  )}
                </div>

                {/* Dietary / accessibility / tags */}
                <div className="flex flex-wrap gap-1">
                  {guest.dietaryRestrictions && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] rounded bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5">
                      <Utensils className="w-2.5 h-2.5" /> {guest.dietaryRestrictions}
                    </span>
                  )}
                  {guest.accessibilityNeeds && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] rounded bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5">
                      <Accessibility className="w-2.5 h-2.5" /> {guest.accessibilityNeeds}
                    </span>
                  )}
                  {guest.relationshipTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] rounded bg-muted text-muted-foreground border border-border px-1.5 py-0.5">
                      <Tag className="w-2.5 h-2.5" /> {tag}
                    </span>
                  ))}
                  {(guestGroupMap.get(guest.id) ?? []).map(({ group, role }) => {
                    const c = group.color ?? RELATIONSHIP_TYPE_COLORS[group.type] ?? 'hsl(200 15% 55%)';
                    return (
                      <span
                        key={group.id}
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium rounded-full px-1.5 py-0.5"
                        style={{ background: `${c}18`, color: c, border: `1px solid ${c}30` }}
                      >
                        <Link2 className="w-2.5 h-2.5" />
                        {role ?? group.name}
                      </span>
                    );
                  })}
                </div>

                {/* Contact info (collapsed) */}
                {(guest.email || guest.phone) && (
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70">
                    {guest.email && (
                      <span className="flex items-center gap-0.5 truncate">
                        <Mail className="w-2.5 h-2.5 flex-shrink-0" /> {guest.email}
                      </span>
                    )}
                    {guest.phone && (
                      <span className="flex items-center gap-0.5">
                        <Phone className="w-2.5 h-2.5 flex-shrink-0" /> {guest.phone}
                      </span>
                    )}
                  </div>
                )}

                {/* Notes */}
                {guest.notes && (
                  <p className="text-[10px] text-muted-foreground/80 italic leading-snug">{guest.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty seats visualization */}
      {openSeats > 0 && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: openSeats }).map((_, i) => (
            <div key={i} className="w-7 h-7 rounded-full border border-dashed border-border/60 bg-muted/20 flex items-center justify-center">
              <span className="text-[8px] text-muted-foreground/50">{guests.length + i + 1}</span>
            </div>
          ))}
        </div>
      )}

      {/* Table notes */}
      {table.notes && (
        <div className="rounded-md bg-muted/30 border border-border/50 px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground">{table.notes}</p>
        </div>
      )}
    </div>
  );
}
