/**
 * Guest Intelligence & Communications Service
 *
 * Provides deep analysis and smart recommendations for event guest management.
 * All functions are pure — no side effects, no store mutations.
 */

import type {
  Guest,
  AppEvent,
  GuestCategory,
  RSVPStatus,
  RelationshipGroup,
  RelationshipMembership,
  RelationshipType,
} from '@/types/events';

// ─────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────

export interface PrioritizedGuest {
  guest: Guest;
  priorityScore: number; // 0-100
  priorityLevel: 'critical' | 'high' | 'medium' | 'low';
  reasons: string[];
  suggestedAction: string;
}

export interface GuestSegment {
  id: string;
  name: string;
  description: string;
  guests: Guest[];
  color: string;
  suggestedAction: string;
  icon: string; // lucide icon name
}

export interface FollowUpItem {
  guest: Guest;
  urgency: 'overdue' | 'due_soon' | 'upcoming';
  reason: string;
  suggestedMessage: string;
  daysSinceInvited: number;
}

export interface AttendanceProjection {
  confirmed: number;
  projected: number;
  optimistic: number;
  conservative: number;
  breakdown: {
    confirmedHeadcount: number;
    pendingHeadcount: number;
    declinedCount: number;
    waitlistCount: number;
  };
}

export interface DietaryAnalysis {
  totalWithRestrictions: number;
  categories: Array<{
    restriction: string;
    count: number;
    guests: Array<{ id: string; name: string }>;
  }>;
  summary: string;
}

export interface GuestConnection {
  guestId: string;
  guestName: string;
  connections: Array<{
    connectedGuestId: string;
    connectedGuestName: string;
    groupName: string;
    groupType: RelationshipType;
    role: string;
  }>;
  totalConnections: number;
  isAnchor: boolean;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** Base weight assigned to each guest category (higher = more important). */
const CATEGORY_WEIGHTS: Record<GuestCategory, number> = {
  donor: 95,
  board_member: 90,
  vip: 85,
  sponsor: 80,
  scholarship_recipient: 70,
  family: 50,
  staff: 40,
  volunteer: 35,
  other: 30,
};

/** RSVP-based urgency modifier. */
const RSVP_URGENCY: Record<RSVPStatus, number> = {
  invited: 20,
  waitlist: 10,
  confirmed: 0,
  checked_in: 0,
  declined: -50,
};

/** Historical confirmation rate used for attendance projections. */
const HISTORICAL_CONFIRMATION_RATE = 0.65;

/** Roles considered "anchor" roles within relationship groups. */
const ANCHOR_ROLES = new Set(['Donor', 'Host', 'Mentor', 'Sponsor']);

// ─────────────────────────────────────────────
// 1. prioritizeGuests
// ─────────────────────────────────────────────

/**
 * Score and rank guests by importance and urgency.
 *
 * Scoring factors:
 * - Category weight (donor highest, other lowest)
 * - RSVP urgency (invited guests need attention)
 * - Party size (larger parties affect more people)
 * - Relationship tags (guests with tags get a group-seating bump)
 *
 * @returns Guests sorted by priorityScore descending.
 */
export function prioritizeGuests(guests: Guest[]): PrioritizedGuest[] {
  return guests
    .map((guest) => {
      const reasons: string[] = [];
      let score = 0;

      // Category weight
      const categoryWeight = CATEGORY_WEIGHTS[guest.category];
      score += categoryWeight;
      reasons.push(`Category "${guest.category}" (weight ${categoryWeight})`);

      // RSVP urgency
      const rsvpMod = RSVP_URGENCY[guest.rsvpStatus];
      if (rsvpMod !== 0) {
        score += rsvpMod;
        if (rsvpMod > 0) {
          reasons.push(`RSVP status "${guest.rsvpStatus}" needs attention (+${rsvpMod})`);
        } else {
          reasons.push(`RSVP status "${guest.rsvpStatus}" (${rsvpMod})`);
        }
      }

      // Party size bonus
      if (guest.partySize > 1) {
        const partyBonus = Math.min((guest.partySize - 1) * 5, 15);
        score += partyBonus;
        reasons.push(`Party of ${guest.partySize} affects multiple seats (+${partyBonus})`);
      }

      // Relationship connections bonus
      if (guest.relationshipTags.length > 0) {
        score += 10;
        reasons.push('Part of relationship group — affects group seating (+10)');
      }

      // Clamp to 0-100
      const priorityScore = Math.max(0, Math.min(100, score));

      // Determine level
      let priorityLevel: PrioritizedGuest['priorityLevel'];
      if (priorityScore >= 90) priorityLevel = 'critical';
      else if (priorityScore >= 70) priorityLevel = 'high';
      else if (priorityScore >= 50) priorityLevel = 'medium';
      else priorityLevel = 'low';

      // Suggested action
      const suggestedAction = deriveSuggestedAction(guest, priorityLevel);

      return { guest, priorityScore, priorityLevel, reasons, suggestedAction };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

/** Derive a recommended next step based on guest state and priority. */
function deriveSuggestedAction(
  guest: Guest,
  level: PrioritizedGuest['priorityLevel'],
): string {
  if (guest.rsvpStatus === 'invited') {
    if (level === 'critical' || level === 'high') {
      return `Send a personal follow-up to ${guest.firstName} immediately`;
    }
    return `Send RSVP reminder to ${guest.firstName}`;
  }
  if (guest.rsvpStatus === 'waitlist') {
    return `Review waitlist status for ${guest.firstName} and confirm if space opens`;
  }
  if (guest.rsvpStatus === 'declined') {
    return `Acknowledge ${guest.firstName}'s decline and check if a representative is attending`;
  }
  if (guest.accessibilityNeeds) {
    return `Verify accessibility arrangements for ${guest.firstName}`;
  }
  if (guest.dietaryRestrictions) {
    return `Confirm catering accommodations for ${guest.firstName}`;
  }
  return `No immediate action needed for ${guest.firstName}`;
}

// ─────────────────────────────────────────────
// 2. getGuestSegments
// ─────────────────────────────────────────────

/**
 * Group guests into actionable segments for quick triage.
 *
 * Only segments with at least one guest are returned.
 */
export function getGuestSegments(guests: Guest[]): GuestSegment[] {
  const highCategories = new Set<GuestCategory>(['donor', 'board_member', 'vip']);

  const segments: GuestSegment[] = [
    {
      id: 'vip-awaiting',
      name: 'VIP Awaiting Response',
      description: 'High-value guests who have not yet responded to their invitation',
      guests: guests.filter(
        (g) => highCategories.has(g.category) && g.rsvpStatus === 'invited',
      ),
      color: 'hsl(0 72% 51%)',
      suggestedAction: 'Send personalized follow-up within 24 hours',
      icon: 'crown',
    },
    {
      id: 'recently-confirmed',
      name: 'Recently Confirmed',
      description: 'Guests who have confirmed their attendance',
      guests: guests.filter((g) => g.rsvpStatus === 'confirmed').slice(0, 5),
      color: 'hsl(152 55% 48%)',
      suggestedAction: 'Send confirmation acknowledgment and event details',
      icon: 'check-circle',
    },
    {
      id: 'needs-follow-up',
      name: 'Needs Follow-Up',
      description: 'Invited guests who have not responded',
      guests: guests.filter((g) => g.rsvpStatus === 'invited'),
      color: 'hsl(38 92% 50%)',
      suggestedAction: 'Send RSVP reminder with deadline',
      icon: 'clock',
    },
    {
      id: 'accessibility',
      name: 'Accessibility Requirements',
      description: 'Guests who have indicated accessibility needs',
      guests: guests.filter((g) => g.accessibilityNeeds.trim().length > 0),
      color: 'hsl(220 65% 52%)',
      suggestedAction: 'Verify venue accommodations match stated needs',
      icon: 'accessibility',
    },
    {
      id: 'dietary',
      name: 'Dietary Restrictions',
      description: 'Guests with dietary restrictions requiring catering coordination',
      guests: guests.filter((g) => g.dietaryRestrictions.trim().length > 0),
      color: 'hsl(280 60% 55%)',
      suggestedAction: 'Share consolidated dietary list with catering team',
      icon: 'utensils',
    },
    {
      id: 'large-parties',
      name: 'Large Parties',
      description: 'Guests bringing more than two people, requiring extra seating',
      guests: guests.filter((g) => g.partySize > 2),
      color: 'hsl(25 85% 55%)',
      suggestedAction: 'Ensure adequate table capacity for large groups',
      icon: 'users',
    },
    {
      id: 'unlinked',
      name: 'Unlinked Guests',
      description: 'Confirmed guests not connected to any relationship group',
      guests: guests.filter(
        (g) => g.rsvpStatus === 'confirmed' && g.relationshipTags.length === 0,
      ),
      color: 'hsl(200 15% 55%)',
      suggestedAction: 'Review for potential relationship links or table-mate preferences',
      icon: 'unlink',
    },
  ];

  // Only return segments that have at least one guest
  return segments.filter((s) => s.guests.length > 0);
}

// ─────────────────────────────────────────────
// 3. generateFollowUpList
// ─────────────────────────────────────────────

/**
 * Build a prioritized follow-up list for guests who have not responded.
 *
 * `daysSinceInvited` is simulated by spreading guests evenly across 3-21 days
 * based on their position in the filtered list (earliest invited first).
 *
 * @returns Items sorted by urgency (overdue first), then by days descending.
 */
export function generateFollowUpList(
  guests: Guest[],
  event: AppEvent,
): FollowUpItem[] {
  const pending = guests.filter((g) => g.rsvpStatus === 'invited');

  if (pending.length === 0) return [];

  return pending
    .map((guest, index) => {
      // Spread days across 3-21 based on index position
      const daysSinceInvited =
        pending.length === 1
          ? 12
          : Math.round(3 + (index / (pending.length - 1)) * 18);

      let urgency: FollowUpItem['urgency'];
      if (daysSinceInvited > 14) urgency = 'overdue';
      else if (daysSinceInvited >= 7) urgency = 'due_soon';
      else urgency = 'upcoming';

      const reason = buildFollowUpReason(guest, daysSinceInvited, urgency);
      const suggestedMessage = buildSuggestedMessage(guest, event);

      return { guest, urgency, reason, suggestedMessage, daysSinceInvited };
    })
    .sort((a, b) => {
      const urgencyOrder: Record<FollowUpItem['urgency'], number> = {
        overdue: 0,
        due_soon: 1,
        upcoming: 2,
      };
      const diff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (diff !== 0) return diff;
      return b.daysSinceInvited - a.daysSinceInvited;
    });
}

function buildFollowUpReason(
  guest: Guest,
  days: number,
  urgency: FollowUpItem['urgency'],
): string {
  const base = `${guest.displayName} was invited ${days} days ago`;
  switch (urgency) {
    case 'overdue':
      return `${base} and has not responded — follow-up is overdue`;
    case 'due_soon':
      return `${base} — follow-up due soon`;
    case 'upcoming':
      return `${base} — follow-up upcoming`;
  }
}

function buildSuggestedMessage(guest: Guest, event: AppEvent): string {
  const first = guest.firstName;
  const eventName = event.name;

  switch (guest.category) {
    case 'donor':
      return `Dear ${first}, we would be honored by your presence at ${eventName}. Your generous support has made a lasting impact, and we would love to celebrate with you.`;
    case 'board_member':
      return `Dear ${first}, as a valued board member, your attendance at ${eventName} is especially meaningful. We look forward to welcoming you.`;
    case 'vip':
      return `Dear ${first}, we have reserved a special place for you at ${eventName}. We truly hope you can join us for this occasion.`;
    default:
      return `Dear ${first}, we hope you can join us for ${eventName}. Please let us know if you can attend so we can finalize arrangements.`;
  }
}

// ─────────────────────────────────────────────
// 4. computeAttendanceProjection
// ─────────────────────────────────────────────

/**
 * Project total attendance using confirmed counts and a historical confirmation
 * rate (65 %) for pending invitees.
 */
export function computeAttendanceProjection(
  guests: Guest[],
): AttendanceProjection {
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in');
  const invited = guests.filter((g) => g.rsvpStatus === 'invited');
  const declined = guests.filter((g) => g.rsvpStatus === 'declined');
  const waitlist = guests.filter((g) => g.rsvpStatus === 'waitlist');

  const confirmedHeadcount = confirmed.reduce((sum, g) => sum + g.partySize, 0);
  const pendingHeadcount = invited.reduce((sum, g) => sum + g.partySize, 0);

  const projectedPending = Math.round(pendingHeadcount * HISTORICAL_CONFIRMATION_RATE);
  const projected = confirmedHeadcount + projectedPending;
  const optimistic = Math.round(projected * 1.1);
  const conservative = Math.round(projected * 0.85);

  return {
    confirmed: confirmed.length,
    projected,
    optimistic,
    conservative,
    breakdown: {
      confirmedHeadcount,
      pendingHeadcount,
      declinedCount: declined.length,
      waitlistCount: waitlist.length,
    },
  };
}

// ─────────────────────────────────────────────
// 5. analyzeDietaryNeeds
// ─────────────────────────────────────────────

/**
 * Parse, normalize, and aggregate dietary restrictions across all guests.
 *
 * Handles comma-separated and slash-separated values. Common terms are
 * normalized to a canonical form (e.g. "gf" → "Gluten-Free").
 */
export function analyzeDietaryNeeds(guests: Guest[]): DietaryAnalysis {
  const NORMALIZATION_MAP: Record<string, string> = {
    vegetarian: 'Vegetarian',
    veg: 'Vegetarian',
    vegan: 'Vegan',
    'gluten-free': 'Gluten-Free',
    'gluten free': 'Gluten-Free',
    gf: 'Gluten-Free',
    'nut allergy': 'Nut Allergy',
    'nut-free': 'Nut Allergy',
    'tree nut allergy': 'Nut Allergy',
    'peanut allergy': 'Nut Allergy',
    'dairy-free': 'Dairy-Free',
    'dairy free': 'Dairy-Free',
    'lactose intolerant': 'Dairy-Free',
    'lactose-free': 'Dairy-Free',
    halal: 'Halal',
    kosher: 'Kosher',
    'shellfish allergy': 'Shellfish Allergy',
    'no shellfish': 'Shellfish Allergy',
    'egg allergy': 'Egg Allergy',
    'egg-free': 'Egg Allergy',
    'soy-free': 'Soy-Free',
    'soy allergy': 'Soy-Free',
    pescatarian: 'Pescatarian',
    keto: 'Keto',
    paleo: 'Paleo',
    'low sodium': 'Low Sodium',
    'low-sodium': 'Low Sodium',
  };

  /** Normalize a single raw restriction string. */
  function normalize(raw: string): string {
    const key = raw.trim().toLowerCase();
    return NORMALIZATION_MAP[key] ?? titleCase(raw.trim());
  }

  function titleCase(str: string): string {
    return str.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Accumulate: restriction → guest references
  const restrictionMap = new Map<string, Array<{ id: string; name: string }>>();

  const guestsWithRestrictions = guests.filter(
    (g) => g.dietaryRestrictions.trim().length > 0,
  );

  for (const guest of guestsWithRestrictions) {
    // Split on comma, semicolon, or slash
    const parts = guest.dietaryRestrictions.split(/[,;/]+/);
    for (const part of parts) {
      if (part.trim().length === 0) continue;
      const normalized = normalize(part);
      if (!restrictionMap.has(normalized)) {
        restrictionMap.set(normalized, []);
      }
      restrictionMap.get(normalized)!.push({
        id: guest.id,
        name: guest.displayName,
      });
    }
  }

  // Build sorted categories (highest count first)
  const categories = Array.from(restrictionMap.entries())
    .map(([restriction, guestList]) => ({
      restriction,
      count: guestList.length,
      guests: guestList,
    }))
    .sort((a, b) => b.count - a.count);

  // Readable summary
  const detailParts = categories.map((c) => `${c.count} ${c.restriction.toLowerCase()}`);
  const summary =
    guestsWithRestrictions.length === 0
      ? 'No guests with dietary restrictions'
      : `${guestsWithRestrictions.length} guest${guestsWithRestrictions.length === 1 ? '' : 's'} with dietary needs: ${detailParts.join(', ')}`;

  return {
    totalWithRestrictions: guestsWithRestrictions.length,
    categories,
    summary,
  };
}

// ─────────────────────────────────────────────
// 6. getGuestConnectionMap
// ─────────────────────────────────────────────

/**
 * Map out the full relationship web for each guest who belongs to at least one
 * relationship group.
 *
 * A guest is considered an "anchor" if any of their membership roles matches
 * the ANCHOR_ROLES set (Donor, Host, Mentor, Sponsor).
 */
export function getGuestConnectionMap(
  guests: Guest[],
  groups: RelationshipGroup[],
  memberships: RelationshipMembership[],
): GuestConnection[] {
  // Index helpers
  const guestById = new Map(guests.map((g) => [g.id, g]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  // Group memberships by guestId for fast lookup
  const membershipsByGuest = new Map<string, RelationshipMembership[]>();
  for (const m of memberships) {
    if (!membershipsByGuest.has(m.guestId)) {
      membershipsByGuest.set(m.guestId, []);
    }
    membershipsByGuest.get(m.guestId)!.push(m);
  }

  // Group memberships by groupId for cross-referencing peers
  const membershipsByGroup = new Map<string, RelationshipMembership[]>();
  for (const m of memberships) {
    if (!membershipsByGroup.has(m.groupId)) {
      membershipsByGroup.set(m.groupId, []);
    }
    membershipsByGroup.get(m.groupId)!.push(m);
  }

  const results: GuestConnection[] = [];

  for (const guest of guests) {
    const myMemberships = membershipsByGuest.get(guest.id);
    if (!myMemberships || myMemberships.length === 0) continue;

    let isAnchor = false;
    const connections: GuestConnection['connections'] = [];

    for (const membership of myMemberships) {
      if (ANCHOR_ROLES.has(membership.role)) {
        isAnchor = true;
      }

      const group = groupById.get(membership.groupId);
      if (!group) continue;

      // Find all peers in the same group
      const peers = membershipsByGroup.get(group.id) ?? [];
      for (const peer of peers) {
        if (peer.guestId === guest.id) continue;

        const peerGuest = guestById.get(peer.guestId);
        if (!peerGuest) continue;

        connections.push({
          connectedGuestId: peerGuest.id,
          connectedGuestName: peerGuest.displayName,
          groupName: group.name,
          groupType: group.type,
          role: peer.role,
        });
      }
    }

    results.push({
      guestId: guest.id,
      guestName: guest.displayName,
      connections,
      totalConnections: connections.length,
      isAnchor,
    });
  }

  // Sort by total connections descending so the most-connected guests appear first
  return results.sort((a, b) => b.totalConnections - a.totalConnections);
}
