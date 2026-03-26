export type EventType = 'ceremony' | 'dinner' | 'gala' | 'reception' | 'banquet' | 'commencement' | 'other';
export type EventStatus = 'planning' | 'active' | 'completed' | 'archived';
export type RSVPStatus = 'invited' | 'confirmed' | 'declined' | 'waitlist' | 'checked_in';
export type GuestCategory = 'donor' | 'scholarship_recipient' | 'family' | 'board_member' | 'vip' | 'staff' | 'sponsor' | 'volunteer' | 'other';
export type LayoutObjectType = 'tent' | 'round_table' | 'rect_table' | 'chair' | 'stage' | 'podium' | 'checkin' | 'photo_area' | 'registration' | 'vip_area' | 'aisle' | 'dance_floor' | 'catering' | 'bar' | 'signage' | 'custom_zone';
export type VersionStatus = 'draft' | 'active' | 'archived' | 'approved';

export interface AppEvent {
  id: string;
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
}

export interface SeatingRule {
  id: string;
  eventId: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
}
