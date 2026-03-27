import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppEvent, Guest, LayoutObject, EventVersion, SeatingAssignment, SeatingRule, Organization, UserProfile, UserAccount, EventCollaborator, RelationshipGroup, RelationshipMembership } from '@/types/events';
import { mockEvents, mockGuests, mockVersions, mockLayoutObjects, mockSeatingAssignments, mockSeatingRules, mockOrganizations } from './mock-data';

// Simple hash for demo purposes — NOT cryptographically secure
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

interface EventStore {
  // Auth
  accounts: UserAccount[];
  userProfile: UserProfile | null;
  setUserProfile: (profile: UserProfile) => void;
  signUp: (firstName: string, lastName: string, email: string, password: string, role: string) => { success: boolean; error?: string };
  signIn: (email: string, password: string) => { success: boolean; error?: string };
  signOut: () => void;

  // Collaborators
  collaborators: EventCollaborator[];
  addCollaborator: (collab: EventCollaborator) => void;
  removeCollaborator: (id: string) => void;
  getEventCollaborators: (eventId: string) => EventCollaborator[];

  // Organization state
  organizations: Organization[];
  activeOrgId: string | null;

  events: AppEvent[];
  guests: Guest[];
  versions: EventVersion[];
  layoutObjects: LayoutObject[];
  seatingAssignments: SeatingAssignment[];
  seatingRules: SeatingRule[];

  // Organization actions
  setActiveOrg: (orgId: string) => void;
  addOrganization: (org: Organization) => void;
  updateOrganization: (id: string, updates: Partial<Organization>) => void;

  // Org-scoped selectors
  getActiveOrg: () => Organization | undefined;
  getOrgEvents: () => AppEvent[];
  getOrgGuests: () => Guest[];

  // Event actions
  addEvent: (event: AppEvent) => void;
  updateEvent: (id: string, updates: Partial<AppEvent>) => void;

  // Guest actions
  addGuest: (guest: Guest) => void;
  updateGuest: (id: string, updates: Partial<Guest>) => void;
  removeGuest: (id: string) => void;

  // Layout actions
  addLayoutObject: (obj: LayoutObject) => void;
  updateLayoutObject: (id: string, updates: Partial<LayoutObject>) => void;
  removeLayoutObject: (id: string) => void;

  // Version actions
  addVersion: (version: EventVersion) => void;
  updateVersion: (id: string, updates: Partial<EventVersion>) => void;

  // Seating actions
  addSeatingAssignment: (assignment: SeatingAssignment) => void;
  removeSeatingAssignment: (id: string) => void;
  moveGuestToTable: (guestId: string, tableId: string, versionId: string) => void;

  // Seating rule actions
  addSeatingRule: (rule: SeatingRule) => void;
  updateSeatingRule: (id: string, updates: Partial<SeatingRule>) => void;
  removeSeatingRule: (id: string) => void;

  // Relationship Engine
  relationshipGroups: RelationshipGroup[];
  relationshipMemberships: RelationshipMembership[];
  addRelationshipGroup: (group: RelationshipGroup) => void;
  updateRelationshipGroup: (id: string, updates: Partial<RelationshipGroup>) => void;
  removeRelationshipGroup: (id: string) => void;
  addRelationshipMembership: (membership: RelationshipMembership) => void;
  removeRelationshipMembership: (id: string) => void;
  getEventRelationshipGroups: (eventId: string) => RelationshipGroup[];
  getGroupMembers: (groupId: string) => Array<{ membership: RelationshipMembership; guest: Guest }>;
  getGuestRelationships: (guestId: string) => Array<{ group: RelationshipGroup; membership: RelationshipMembership }>;

  // Selectors
  getEventGuests: (eventId: string) => Guest[];
  getEventVersions: (eventId: string) => EventVersion[];
  getVersionObjects: (versionId: string) => LayoutObject[];
  getVersionSeating: (versionId: string) => SeatingAssignment[];
  getEventRules: (eventId: string) => SeatingRule[];
  getTableGuests: (tableId: string, versionId: string) => Guest[];

  // Onboarding
  hasCompletedOnboarding: boolean;
  setOnboardingComplete: () => void;
  loadSampleData: () => void;

  // Reset
  resetStore: () => void;
}

export const useEventStore = create<EventStore>()(
  persist(
    (set, get) => ({
  accounts: [],
  userProfile: null,
  setUserProfile: (profile) => set({ userProfile: profile }),

  signUp: (firstName, lastName, email, password, role) => {
    const state = get();
    if (state.accounts.some((a) => a.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, error: 'An account with this email already exists. Please sign in.' };
    }
    const id = `user-${crypto.randomUUID().slice(0, 8)}`;
    const account: UserAccount = {
      id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: simpleHash(password),
      role,
      createdAt: new Date().toISOString(),
    };
    const profile: UserProfile = { id, firstName: account.firstName, lastName: account.lastName, email: account.email, role, createdAt: account.createdAt };
    set({ accounts: [...state.accounts, account], userProfile: profile });
    return { success: true };
  },

  signIn: (email, password) => {
    const state = get();
    const account = state.accounts.find((a) => a.email === email.trim().toLowerCase());
    if (!account) {
      return { success: false, error: 'No account found with this email.' };
    }
    if (account.passwordHash !== simpleHash(password)) {
      return { success: false, error: 'Incorrect password.' };
    }
    const profile: UserProfile = { id: account.id, firstName: account.firstName, lastName: account.lastName, email: account.email, role: account.role, createdAt: account.createdAt };
    set({ userProfile: profile });
    return { success: true };
  },

  signOut: () => set({ userProfile: null }),

  collaborators: [],
  addCollaborator: (collab) => set((s) => ({ collaborators: [...s.collaborators, collab] })),
  removeCollaborator: (id) => set((s) => ({ collaborators: s.collaborators.filter((c) => c.id !== id) })),
  getEventCollaborators: (eventId) => get().collaborators.filter((c) => c.eventId === eventId),

  organizations: [],
  activeOrgId: null,

  events: [],
  guests: [],
  versions: [],
  layoutObjects: [],
  seatingAssignments: [],
  seatingRules: [],
  relationshipGroups: [],
  relationshipMemberships: [],

  hasCompletedOnboarding: false,

  // Organization actions
  setActiveOrg: (orgId) => set({ activeOrgId: orgId }),
  addOrganization: (org) => set((s) => ({ organizations: [...s.organizations, org], hasCompletedOnboarding: true })),
  updateOrganization: (id, updates) => set((s) => ({
    organizations: s.organizations.map((o) => o.id === id ? { ...o, ...updates } : o),
  })),

  // Org-scoped selectors
  getActiveOrg: () => get().organizations.find((o) => o.id === get().activeOrgId),
  getOrgEvents: () => {
    const orgId = get().activeOrgId;
    return orgId ? get().events.filter((e) => e.orgId === orgId) : get().events;
  },
  getOrgGuests: () => {
    const orgId = get().activeOrgId;
    return orgId ? get().guests.filter((g) => g.orgId === orgId) : get().guests;
  },

  addEvent: (event) => set((s) => ({ events: [...s.events, event] })),
  updateEvent: (id, updates) => set((s) => ({ events: s.events.map((e) => e.id === id ? { ...e, ...updates } : e) })),

  addGuest: (guest) => set((s) => ({ guests: [...s.guests, guest] })),
  updateGuest: (id, updates) => set((s) => ({ guests: s.guests.map((g) => g.id === id ? { ...g, ...updates } : g) })),
  removeGuest: (id) => set((s) => ({ guests: s.guests.filter((g) => g.id !== id) })),

  addLayoutObject: (obj) => set((s) => ({ layoutObjects: [...s.layoutObjects, obj] })),
  updateLayoutObject: (id, updates) => set((s) => ({ layoutObjects: s.layoutObjects.map((o) => o.id === id ? { ...o, ...updates } : o) })),
  removeLayoutObject: (id) => set((s) => ({ layoutObjects: s.layoutObjects.filter((o) => o.id !== id) })),

  addVersion: (version) => set((s) => ({ versions: [...s.versions, version] })),
  updateVersion: (id, updates) => set((s) => ({ versions: s.versions.map((v) => v.id === id ? { ...v, ...updates } : v) })),

  addSeatingAssignment: (a) => set((s) => ({ seatingAssignments: [...s.seatingAssignments, a] })),
  removeSeatingAssignment: (id) => set((s) => ({ seatingAssignments: s.seatingAssignments.filter((a) => a.id !== id) })),
  moveGuestToTable: (guestId, tableId, versionId) => set((s) => {
    const filtered = s.seatingAssignments.filter((a) => !(a.guestId === guestId && a.versionId === versionId));
    const newAssignment: SeatingAssignment = { id: `sa-${crypto.randomUUID()}`, versionId, guestId, tableId };
    return { seatingAssignments: [...filtered, newAssignment] };
  }),

  addSeatingRule: (rule) => set((s) => ({ seatingRules: [...s.seatingRules, rule] })),
  updateSeatingRule: (id, updates) => set((s) => ({ seatingRules: s.seatingRules.map((r) => r.id === id ? { ...r, ...updates } : r) })),
  removeSeatingRule: (id) => set((s) => ({ seatingRules: s.seatingRules.filter((r) => r.id !== id) })),

  // Relationship Engine
  addRelationshipGroup: (group) => set((s) => ({ relationshipGroups: [...s.relationshipGroups, group] })),
  updateRelationshipGroup: (id, updates) => set((s) => ({ relationshipGroups: s.relationshipGroups.map((g) => g.id === id ? { ...g, ...updates } : g) })),
  removeRelationshipGroup: (id) => set((s) => ({
    relationshipGroups: s.relationshipGroups.filter((g) => g.id !== id),
    relationshipMemberships: s.relationshipMemberships.filter((m) => m.groupId !== id),
  })),
  addRelationshipMembership: (membership) => set((s) => ({ relationshipMemberships: [...s.relationshipMemberships, membership] })),
  removeRelationshipMembership: (id) => set((s) => ({ relationshipMemberships: s.relationshipMemberships.filter((m) => m.id !== id) })),
  getEventRelationshipGroups: (eventId) => get().relationshipGroups.filter((g) => g.eventId === eventId),
  getGroupMembers: (groupId) => {
    const memberships = get().relationshipMemberships.filter((m) => m.groupId === groupId);
    const guests = get().guests;
    return memberships.map((m) => ({ membership: m, guest: guests.find((g) => g.id === m.guestId)! })).filter((m) => m.guest);
  },
  getGuestRelationships: (guestId) => {
    const memberships = get().relationshipMemberships.filter((m) => m.guestId === guestId);
    const groups = get().relationshipGroups;
    return memberships.map((m) => ({ group: groups.find((g) => g.id === m.groupId)!, membership: m })).filter((r) => r.group);
  },

  getEventGuests: (eventId) => get().guests.filter((g) => g.eventId === eventId),
  getEventVersions: (eventId) => get().versions.filter((v) => v.eventId === eventId),
  getVersionObjects: (versionId) => get().layoutObjects.filter((o) => o.versionId === versionId),
  getVersionSeating: (versionId) => get().seatingAssignments.filter((a) => a.versionId === versionId),
  getEventRules: (eventId) => get().seatingRules.filter((r) => r.eventId === eventId),
  getTableGuests: (tableId, versionId) => {
    const assignments = get().seatingAssignments.filter((a) => a.tableId === tableId && a.versionId === versionId);
    const guestIds = assignments.map((a) => a.guestId);
    return get().guests.filter((g) => guestIds.includes(g.id));
  },

  setOnboardingComplete: () => set({ hasCompletedOnboarding: true }),

  loadSampleData: () => set((s) => ({
    hasCompletedOnboarding: true,
    organizations: [...s.organizations, ...mockOrganizations],
    activeOrgId: mockOrganizations[0]?.id ?? s.activeOrgId,
    events: [...s.events, ...mockEvents],
    guests: [...s.guests, ...mockGuests],
    versions: [...s.versions, ...mockVersions],
    layoutObjects: [...s.layoutObjects, ...mockLayoutObjects],
    seatingAssignments: [...s.seatingAssignments, ...mockSeatingAssignments],
    seatingRules: [...s.seatingRules, ...mockSeatingRules],
  })),

  resetStore: () => {
    // Keep accounts so users can re-sign-in, but clear session and data
    const accounts = get().accounts;
    localStorage.removeItem('event-intelligence-hub-store');
    set({
      accounts,
      userProfile: null,
      collaborators: [],
      relationshipGroups: [],
      relationshipMemberships: [],
      organizations: [],
      activeOrgId: null,
      events: [],
      guests: [],
      versions: [],
      layoutObjects: [],
      seatingAssignments: [],
      seatingRules: [],
      hasCompletedOnboarding: false,
    });
  },
}),
    {
      name: 'event-intelligence-hub-store',
      partialize: (state) => ({
        accounts: state.accounts,
        userProfile: state.userProfile,
        collaborators: state.collaborators,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        organizations: state.organizations,
        activeOrgId: state.activeOrgId,
        events: state.events,
        guests: state.guests,
        versions: state.versions,
        layoutObjects: state.layoutObjects,
        seatingAssignments: state.seatingAssignments,
        seatingRules: state.seatingRules,
        relationshipGroups: state.relationshipGroups,
        relationshipMemberships: state.relationshipMemberships,
      }),
    }
  )
);
