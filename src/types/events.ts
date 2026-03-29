export type EventType = 'ceremony' | 'dinner' | 'gala' | 'reception' | 'banquet' | 'commencement' | 'other';
export type EventStatus = 'planning' | 'active' | 'completed' | 'archived';
export type RSVPStatus = 'invited' | 'confirmed' | 'declined' | 'waitlist' | 'checked_in';
export type GuestCategory = 'donor' | 'scholarship_recipient' | 'family' | 'board_member' | 'vip' | 'staff' | 'sponsor' | 'volunteer' | 'other';
export type LayoutObjectType = 'tent' | 'round_table' | 'rect_table' | 'chair' | 'stage' | 'podium' | 'checkin' | 'photo_area' | 'registration' | 'vip_area' | 'aisle' | 'dance_floor' | 'catering' | 'bar' | 'signage' | 'custom_zone';
export type VersionStatus = 'draft' | 'active' | 'archived' | 'approved';

/** A stored user account */
export interface UserAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string; // simple hash for demo — not production-grade
  role: string;
  avatarUrl?: string;
  createdAt: string;
}

/** The logged-in user's profile (no password) */
export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  avatarUrl?: string;
  createdAt: string;
}

export type CollaboratorRole = 'owner' | 'coordinator' | 'co-host' | 'viewer';

/** A collaborator invited to an event */
export interface EventCollaborator {
  id: string;
  eventId: string;
  email: string;
  name: string;
  role: CollaboratorRole;
  invitedBy: string; // userId
  invitedAt: string;
  status: 'pending' | 'accepted';
}

/** An organization / school instance — all data is scoped to one */
export interface Organization {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string;
  primaryColor?: string;
  createdAt: string;
}

export interface AppEvent {
  id: string;
  orgId: string;
  name: string;
  type: EventType;
  status: EventStatus;
  date: string;
  time: string;
  venue: string;
  venueAddress: string;
  estimatedAttendance: number;
  notes: string;
  activeVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Guest {
  id: string;
  orgId: string;
  eventId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  organization: string;
  category: GuestCategory;
  rsvpStatus: RSVPStatus;
  partySize: number;
  dietaryRestrictions: string;
  accessibilityNeeds: string;
  notes: string;
  relationshipTags: string[];
  tablePreference: string;
  seatingPreference: string;
  plusOneId?: string;
  householdId?: string;
}

export interface LayoutObject {
  id: string;
  versionId: string;
  type: LayoutObjectType;
  name: string;
  /** Persistent table number for cross-module identity (layout ↔ seating) */
  tableNumber?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  capacity: number;
  notes: string;
  category: string;
  parentId?: string;
  locked: boolean;
  visible: boolean;
  zIndex: number;
}

export interface SeatingAssignment {
  id: string;
  versionId: string;
  guestId: string;
  tableId: string;
  seatNumber?: number;
}

export interface EventVersion {
  id: string;
  eventId: string;
  name: string;
  status: VersionStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  notes: string;
  // Venue map / satellite image (data URL or blob URL, persisted in store)
  venueImageData?: string;
  venueImageOpacity?: number;
  metersPerPixel?: number;
}

export type SeatingRuleType = 'same_tag' | 'cross_tag' | 'relationship_group' | 'custom';
export type SeatingIntent = 'same_table' | 'nearby' | 'separate';

export interface SeatingRule {
  id: string;
  eventId: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  /** Structured rule definition — undefined for legacy/custom rules */
  ruleType?: SeatingRuleType;
  /** For same_tag: guests sharing this tag should be seated per the intent */
  tag?: string;
  /** For cross_tag: seat guests with tagA near/with guests with tagB */
  tagA?: string;
  tagB?: string;
  /** For relationship_group: seat members of this group per intent */
  relationshipGroupId?: string;
  /** What the rule wants: same table, nearby tables, or keep apart */
  intent?: SeatingIntent;
}

// ──────────────────────────────────────────────
// Relationship Engine
// ──────────────────────────────────────────────

/** The kind of connection between guests */
export type RelationshipType =
  | 'scholarship'   // donor <-> recipient(s) via a named fund
  | 'mentorship'    // mentor <-> mentee(s)
  | 'family'        // family / household members
  | 'host_guest'    // VIP / board host <-> their invited guests
  | 'sponsor'       // corporate sponsor <-> designated scholars
  | 'plus_one'      // guest <-> their plus-one
  | 'custom';       // user-defined

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  scholarship: 'Scholarship / Fund',
  mentorship: 'Mentorship',
  family: 'Family / Household',
  host_guest: 'Host & Guests',
  sponsor: 'Sponsor',
  plus_one: 'Plus One',
  custom: 'Custom',
};

export const RELATIONSHIP_TYPE_COLORS: Record<RelationshipType, string> = {
  scholarship: 'hsl(152 55% 48%)',
  mentorship: 'hsl(220 65% 52%)',
  family: 'hsl(25 85% 55%)',
  host_guest: 'hsl(280 60% 55%)',
  sponsor: 'hsl(45 90% 50%)',
  plus_one: 'hsl(350 65% 52%)',
  custom: 'hsl(200 15% 55%)',
};

/** Suggested roles per relationship type */
export const RELATIONSHIP_ROLE_SUGGESTIONS: Record<RelationshipType, string[]> = {
  scholarship: ['Donor', 'Recipient'],
  mentorship: ['Mentor', 'Mentee'],
  family: ['Member'],
  host_guest: ['Host', 'Guest'],
  sponsor: ['Sponsor', 'Scholar'],
  plus_one: ['Primary', 'Plus One'],
  custom: ['Member'],
};

/** A named group that ties guests together */
export interface RelationshipGroup {
  id: string;
  eventId: string;
  orgId: string;
  name: string;
  type: RelationshipType;
  color?: string;
  notes?: string;
  createdAt: string;
}

/** A membership: a guest belongs to a group with a role */
export interface RelationshipMembership {
  id: string;
  groupId: string;
  guestId: string;
  role: string; // freeform but with suggestions per type
}
