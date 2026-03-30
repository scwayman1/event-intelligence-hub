import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppEvent, Guest, LayoutObject, EventVersion, SeatingAssignment, SeatingRule, Organization, UserProfile, UserAccount, EventCollaborator, RelationshipGroup, RelationshipMembership, TeamInvite, OrgMember, InviteRole } from '@/types/events';
import { mockEvents, mockGuests, mockVersions, mockLayoutObjects, mockSeatingAssignments, mockSeatingRules, mockOrganizations } from './mock-data';
import { seedDonors, seedRecipients, seedAllGuests, seedRelationshipGroups, seedRelationshipMemberships } from './scholarship-seed-data';
import { MESSAGING_DEFAULTS, createMessagingActions, type MessagingState, type MessagingActions } from './messaging-store';
import * as db from '@/services/supabase-db';

// Fire-and-forget async Supabase write — keeps UI snappy
function dbSync(fn: () => Promise<void>) {
  fn().catch((err) => console.error('[supabase-sync]', err));
}

// ──────────────────────────────────────────────
// Store version — bump this when adding persisted fields
// ──────────────────────────────────────────────
const STORE_VERSION = 10;

// Simple hash for demo purposes — NOT cryptographically secure
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Default values for every persisted field — used for initial state
// AND as fallback defaults during migration so new fields never go missing
const PERSISTED_DEFAULTS = {
  accounts: [] as UserAccount[],
  userProfile: null as UserProfile | null,
  collaborators: [] as EventCollaborator[],
  hasCompletedOnboarding: false,
  organizations: [] as Organization[],
  activeOrgId: null as string | null,
  events: [] as AppEvent[],
  guests: [] as Guest[],
  versions: [] as EventVersion[],
  layoutObjects: [] as LayoutObject[],
  seatingAssignments: [] as SeatingAssignment[],
  seatingRules: [] as SeatingRule[],
  relationshipGroups: [] as RelationshipGroup[],
  relationshipMemberships: [] as RelationshipMembership[],
  teamInvites: [] as TeamInvite[],
  orgMembers: [] as OrgMember[],
  pendingInviteCode: null as string | null,
  ...MESSAGING_DEFAULTS,
};

type PersistedState = typeof PERSISTED_DEFAULTS;

interface EventStore extends PersistedState, MessagingActions {
  // Auth actions
  setUserProfile: (profile: UserProfile) => void;
  signUp: (firstName: string, lastName: string, email: string, password: string, role: string) => { success: boolean; error?: string };
  signIn: (email: string, password: string) => { success: boolean; error?: string };
  signOut: () => void;

  // Collaborators
  addCollaborator: (collab: EventCollaborator) => void;
  removeCollaborator: (id: string) => void;
  getEventCollaborators: (eventId: string) => EventCollaborator[];

  // Organization actions
  setActiveOrg: (orgId: string) => void;
  addOrganization: (org: Organization) => void;
  updateOrganization: (id: string, updates: Partial<Organization>) => void;

  // Team Invite actions
  createTeamInvite: (orgId: string, role: InviteRole) => TeamInvite;
  revokeTeamInvite: (inviteId: string) => void;
  getOrgInvites: (orgId: string) => TeamInvite[];
  findInviteByCode: (code: string) => TeamInvite | undefined;
  redeemInvite: (inviteCode: string) => { success: boolean; error?: string; orgId?: string };
  setPendingInviteCode: (code: string | null) => void;

  // Org Member actions
  addOrgMember: (member: OrgMember) => void;
  removeOrgMember: (memberId: string) => void;
  getOrgMembers: (orgId: string) => OrgMember[];
  isUserOrgMember: (orgId: string, userId: string) => boolean;

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
  /** Re-number all tables in a version sequentially by spatial position (top-left → bottom-right) */
  renumberTablesByPosition: (versionId: string) => void;

  // Version actions
  addVersion: (version: EventVersion) => void;
  updateVersion: (id: string, updates: Partial<EventVersion>) => void;

  // Seating actions
  addSeatingAssignment: (assignment: SeatingAssignment) => void;
  removeSeatingAssignment: (id: string) => void;
  moveGuestToTable: (guestId: string, tableId: string, versionId: string) => void;
  assignGuestToSeat: (guestId: string, tableId: string, seatNumber: number, versionId: string) => void;
  unassignGuestFromSeat: (guestId: string, versionId: string) => void;
  autoAssignByRelationshipGroup: (anchorGuestId: string, tableId: string, versionId: string) => string[];
  getTableSeatAssignments: (tableId: string, versionId: string) => SeatingAssignment[];

  // Seating rule actions
  addSeatingRule: (rule: SeatingRule) => void;
  updateSeatingRule: (id: string, updates: Partial<SeatingRule>) => void;
  removeSeatingRule: (id: string) => void;

  // Relationship Engine
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
  setOnboardingComplete: () => void;
  loadSampleData: () => void;
  loadScholarshipSeedData: (half: 'first' | 'all') => void;

  // Reset
  resetStore: () => void;
}

export const useEventStore = create<EventStore>()(
  persist(
    (set, get) => ({
  // ── Initial state (spread from defaults) ──
  ...PERSISTED_DEFAULTS,

  // ── Auth ──
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

  // ── Collaborators ──
  addCollaborator: (collab) => {
    set((s) => ({ collaborators: [...s.collaborators, collab] }));
    dbSync(() => db.upsertCollaborator(collab));
  },
  removeCollaborator: (id) => {
    set((s) => ({ collaborators: s.collaborators.filter((c) => c.id !== id) }));
    dbSync(() => db.deleteCollaborator(id));
  },
  getEventCollaborators: (eventId) => get().collaborators.filter((c) => c.eventId === eventId),

  // ── Organization actions ──
  setActiveOrg: (orgId) => {
    set({ activeOrgId: orgId });
    // Push org LLM config to the provider layer so all team members share it
    const org = get().organizations.find((o) => o.id === orgId);
    import('@/services/llm-providers').then(({ setOrgLLMConfig }) => {
      setOrgLLMConfig(org?.llmConfig);
    });
  },
  addOrganization: (org) => {
    const userId = get().userProfile?.id;
    const ownerMember: OrgMember | null = userId ? {
      id: `member-${crypto.randomUUID().slice(0, 8)}`,
      orgId: org.id,
      userId,
      role: 'owner',
      joinedAt: new Date().toISOString(),
    } : null;
    set((s) => ({
      organizations: [...s.organizations, org],
      hasCompletedOnboarding: true,
      orgMembers: ownerMember ? [...s.orgMembers, ownerMember] : s.orgMembers,
    }));
    if (userId) dbSync(() => db.createOrgWithMember(org, userId));
  },
  updateOrganization: (id, updates) => {
    set((s) => ({
      organizations: s.organizations.map((o) => o.id === id ? { ...o, ...updates } : o),
    }));
    const fullOrg = get().organizations.find((o) => o.id === id);
    if (fullOrg) {
      dbSync(() => db.upsertOrganization(fullOrg));
      // If updating the active org's LLM config, push it to the provider layer immediately
      if (updates.llmConfig !== undefined && id === get().activeOrgId) {
        import('@/services/llm-providers').then(({ setOrgLLMConfig }) => {
          setOrgLLMConfig(fullOrg.llmConfig);
        });
      }
    }
  },

  // ── Team Invites ──
  createTeamInvite: (orgId, role) => {
    const state = get();
    const invite: TeamInvite = {
      id: `invite-${crypto.randomUUID().slice(0, 8)}`,
      orgId,
      inviteCode: crypto.randomUUID(),
      role,
      createdBy: state.userProfile?.id ?? 'unknown',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    };
    set((s) => ({ teamInvites: [...s.teamInvites, invite] }));
    return invite;
  },
  revokeTeamInvite: (inviteId) => {
    set((s) => ({ teamInvites: s.teamInvites.filter((i) => i.id !== inviteId) }));
  },
  getOrgInvites: (orgId) => get().teamInvites.filter((i) => i.orgId === orgId),
  findInviteByCode: (code) => get().teamInvites.find((i) => i.inviteCode === code),
  redeemInvite: (inviteCode) => {
    const state = get();
    const user = state.userProfile;
    if (!user) return { success: false, error: 'You must be signed in to accept an invite.' };

    const invite = state.teamInvites.find((i) => i.inviteCode === inviteCode);
    if (!invite) return { success: false, error: 'This invite link is invalid or has been revoked.' };
    if (invite.usedBy) return { success: false, error: 'This invite has already been used.' };
    if (new Date(invite.expiresAt) < new Date()) return { success: false, error: 'This invite has expired.' };

    // Check if already a member
    const alreadyMember = state.orgMembers.some((m) => m.orgId === invite.orgId && m.userId === user.id);
    if (alreadyMember) return { success: false, error: 'You are already a member of this organization.' };

    // Mark invite as used
    const updatedInvites = state.teamInvites.map((i) =>
      i.id === invite.id ? { ...i, usedBy: user.id, usedAt: new Date().toISOString() } : i
    );

    // Add org member
    const newMember: OrgMember = {
      id: `member-${crypto.randomUUID().slice(0, 8)}`,
      orgId: invite.orgId,
      userId: user.id,
      role: invite.role,
      joinedAt: new Date().toISOString(),
      inviteId: invite.id,
    };

    set({
      teamInvites: updatedInvites,
      orgMembers: [...state.orgMembers, newMember],
      activeOrgId: invite.orgId,
      pendingInviteCode: null,
    });

    return { success: true, orgId: invite.orgId };
  },
  setPendingInviteCode: (code) => set({ pendingInviteCode: code }),

  // ── Org Members ──
  addOrgMember: (member) => {
    set((s) => ({ orgMembers: [...s.orgMembers, member] }));
  },
  removeOrgMember: (memberId) => {
    set((s) => ({ orgMembers: s.orgMembers.filter((m) => m.id !== memberId) }));
  },
  getOrgMembers: (orgId) => get().orgMembers.filter((m) => m.orgId === orgId),
  isUserOrgMember: (orgId, userId) => get().orgMembers.some((m) => m.orgId === orgId && m.userId === userId),

  // ── Org-scoped selectors ──
  getActiveOrg: () => get().organizations.find((o) => o.id === get().activeOrgId),
  getOrgEvents: () => {
    const orgId = get().activeOrgId;
    return orgId ? get().events.filter((e) => e.orgId === orgId) : get().events;
  },
  getOrgGuests: () => {
    const orgId = get().activeOrgId;
    return orgId ? get().guests.filter((g) => g.orgId === orgId) : get().guests;
  },

  // ── CRUD ──
  addEvent: (event) => {
    set((s) => ({ events: [...s.events, event] }));
    dbSync(() => db.upsertEvent(event));
  },
  updateEvent: (id, updates) => {
    set((s) => ({ events: s.events.map((e) => e.id === id ? { ...e, ...updates } : e) }));
    const fullEvent = get().events.find((e) => e.id === id);
    if (fullEvent) dbSync(() => db.upsertEvent(fullEvent));
  },

  addGuest: (guest) => {
    set((s) => ({ guests: [...s.guests, guest] }));
    dbSync(() => db.upsertGuest(guest));
  },
  updateGuest: (id, updates) => {
    set((s) => ({ guests: s.guests.map((g) => g.id === id ? { ...g, ...updates } : g) }));
    const fullGuest = get().guests.find((g) => g.id === id);
    if (fullGuest) dbSync(() => db.upsertGuest(fullGuest));
  },
  removeGuest: (id) => {
    set((s) => ({
      guests: s.guests.filter((g) => g.id !== id),
      relationshipMemberships: s.relationshipMemberships.filter((m) => m.guestId !== id),
    }));
    dbSync(() => db.deleteGuest(id));
  },

  addLayoutObject: (obj) => {
    set((s) => ({ layoutObjects: [...s.layoutObjects, obj] }));
    dbSync(() => db.upsertLayoutObject(obj));
  },
  updateLayoutObject: (id, updates) => {
    set((s) => ({ layoutObjects: s.layoutObjects.map((o) => o.id === id ? { ...o, ...updates } : o) }));
    const fullObj = get().layoutObjects.find((o) => o.id === id);
    if (fullObj) dbSync(() => db.upsertLayoutObject(fullObj));
  },
  removeLayoutObject: (id) => {
    set((s) => ({ layoutObjects: s.layoutObjects.filter((o) => o.id !== id) }));
    dbSync(() => db.deleteLayoutObject(id));
  },
  renumberTablesByPosition: (versionId) => {
    set((s) => {
      // Get only tables for this version
      const tables = s.layoutObjects.filter(
        (o) => o.versionId === versionId && (o.type === 'round_table' || o.type === 'rect_table'),
      );
      if (tables.length === 0) return s;

      // --- Cluster tables into rows by Y-position ---
      // Sort all tables by Y first
      const byY = [...tables].sort((a, b) => a.y - b.y);

      // Cluster into rows: tables within ROW_THRESHOLD of the row's
      // average Y belong to the same row
      const ROW_THRESHOLD = 50; // half a table height — generous enough for manual placement
      const rows: typeof tables[] = [];
      for (const t of byY) {
        // Try to add to the last row
        if (rows.length > 0) {
          const lastRow = rows[rows.length - 1];
          const rowAvgY = lastRow.reduce((sum, r) => sum + r.y, 0) / lastRow.length;
          if (Math.abs(t.y - rowAvgY) <= ROW_THRESHOLD) {
            lastRow.push(t);
            continue;
          }
        }
        // Start a new row
        rows.push([t]);
      }

      // Sort each row left-to-right by X, then flatten
      const sorted = rows.flatMap((row) =>
        row.sort((a, b) => a.x - b.x),
      );

      // Build ID → new number map
      const numberMap = new Map<string, number>();
      sorted.forEach((t, i) => numberMap.set(t.id, i + 1));

      // Apply new numbers + names
      const updated = s.layoutObjects.map((o) => {
        const newNum = numberMap.get(o.id);
        if (newNum != null) {
          return { ...o, tableNumber: newNum, name: `Table ${newNum}` };
        }
        return o;
      });

      // Sync to DB
      for (const o of updated) {
        if (numberMap.has(o.id)) {
          dbSync(() => db.upsertLayoutObject(o));
        }
      }

      return { layoutObjects: updated };
    });
  },

  addVersion: (version) => {
    set((s) => ({ versions: [...s.versions, version] }));
    dbSync(() => db.upsertVersion(version));
  },
  updateVersion: (id, updates) => {
    set((s) => ({ versions: s.versions.map((v) => v.id === id ? { ...v, ...updates } : v) }));
    const fullVersion = get().versions.find((v) => v.id === id);
    if (fullVersion) dbSync(() => db.upsertVersion(fullVersion));
  },

  addSeatingAssignment: (a) => {
    set((s) => ({ seatingAssignments: [...s.seatingAssignments, a] }));
    dbSync(() => db.upsertSeatingAssignment(a));
  },
  removeSeatingAssignment: (id) => {
    set((s) => ({ seatingAssignments: s.seatingAssignments.filter((a) => a.id !== id) }));
    dbSync(() => db.deleteSeatingAssignment(id));
  },
  moveGuestToTable: (guestId, tableId, versionId) => {
    const state = get();
    const toRemove = state.seatingAssignments.filter((a) => a.guestId === guestId && a.versionId === versionId);
    const filtered = state.seatingAssignments.filter((a) => !(a.guestId === guestId && a.versionId === versionId));
    const newAssignment: SeatingAssignment = { id: `sa-${crypto.randomUUID()}`, versionId, guestId, tableId };
    set({ seatingAssignments: [...filtered, newAssignment] });
    dbSync(async () => {
      await Promise.all(toRemove.map((a) => db.deleteSeatingAssignment(a.id)));
      await db.upsertSeatingAssignment(newAssignment);
    });
  },

  assignGuestToSeat: (guestId, tableId, seatNumber, versionId) => {
    const state = get();
    const toRemove = state.seatingAssignments.filter((a) =>
      (a.guestId === guestId && a.versionId === versionId) ||
      (a.tableId === tableId && a.seatNumber === seatNumber && a.versionId === versionId)
    );
    const filtered = state.seatingAssignments.filter((a) =>
      !(a.guestId === guestId && a.versionId === versionId) &&
      !(a.tableId === tableId && a.seatNumber === seatNumber && a.versionId === versionId)
    );
    const newAssignment: SeatingAssignment = { id: `sa-${crypto.randomUUID()}`, versionId, guestId, tableId, seatNumber };
    set({ seatingAssignments: [...filtered, newAssignment] });
    dbSync(async () => {
      await Promise.all(toRemove.map((a) => db.deleteSeatingAssignment(a.id)));
      await db.upsertSeatingAssignment(newAssignment);
    });
  },

  unassignGuestFromSeat: (guestId, versionId) => {
    const toRemove = get().seatingAssignments.filter((a) => a.guestId === guestId && a.versionId === versionId);
    set((s) => ({
      seatingAssignments: s.seatingAssignments.filter((a) => !(a.guestId === guestId && a.versionId === versionId)),
    }));
    dbSync(async () => {
      await Promise.all(toRemove.map((a) => db.deleteSeatingAssignment(a.id)));
    });
  },

  autoAssignByRelationshipGroup: (anchorGuestId, tableId, versionId) => {
    const state = get();

    // Find all relationship groups the anchor guest belongs to
    const anchorMemberships = state.relationshipMemberships.filter((m) => m.guestId === anchorGuestId);
    const anchorGroupIds = new Set(anchorMemberships.map((m) => m.groupId));

    // Collect all guest IDs across those groups
    const groupMemberIds = new Set<string>();
    state.relationshipMemberships
      .filter((m) => anchorGroupIds.has(m.groupId))
      .forEach((m) => groupMemberIds.add(m.guestId));

    // Find unassigned members (no assignment in this version)
    const assignedGuestIds = new Set(
      state.seatingAssignments
        .filter((a) => a.versionId === versionId)
        .map((a) => a.guestId)
    );
    const unassignedMemberIds = [...groupMemberIds].filter((id) => !assignedGuestIds.has(id));

    if (unassignedMemberIds.length === 0) return [];

    // Get the table's capacity and currently occupied seat numbers at this table in this version
    const tableObj = state.layoutObjects.find((o) => o.id === tableId && o.versionId === versionId);
    const capacity = tableObj?.capacity ?? 0;

    const occupiedSeats = new Set(
      state.seatingAssignments
        .filter((a) => a.tableId === tableId && a.versionId === versionId && a.seatNumber !== undefined)
        .map((a) => a.seatNumber as number)
    );

    // Build list of open seat numbers (1-based up to capacity)
    const openSeats: number[] = [];
    for (let seat = 1; seat <= capacity; seat++) {
      if (!occupiedSeats.has(seat)) openSeats.push(seat);
    }

    // Pair unassigned members with open seats
    const toAssign = unassignedMemberIds.slice(0, openSeats.length);
    const newAssignments: SeatingAssignment[] = toAssign.map((guestId, idx) => ({
      id: `sa-${crypto.randomUUID()}`,
      versionId,
      guestId,
      tableId,
      seatNumber: openSeats[idx],
    }));

    set((s) => ({ seatingAssignments: [...s.seatingAssignments, ...newAssignments] }));
    dbSync(async () => {
      await Promise.all(newAssignments.map((a) => db.upsertSeatingAssignment(a)));
    });

    return toAssign;
  },

  getTableSeatAssignments: (tableId, versionId) =>
    get()
      .seatingAssignments
      .filter((a) => a.tableId === tableId && a.versionId === versionId)
      .sort((a, b) => (a.seatNumber ?? 0) - (b.seatNumber ?? 0)),

  addSeatingRule: (rule) => {
    set((s) => ({ seatingRules: [...s.seatingRules, rule] }));
    dbSync(() => db.upsertSeatingRule(rule));
  },
  updateSeatingRule: (id, updates) => {
    set((s) => ({ seatingRules: s.seatingRules.map((r) => r.id === id ? { ...r, ...updates } : r) }));
    const fullRule = get().seatingRules.find((r) => r.id === id);
    if (fullRule) dbSync(() => db.upsertSeatingRule(fullRule));
  },
  removeSeatingRule: (id) => {
    set((s) => ({ seatingRules: s.seatingRules.filter((r) => r.id !== id) }));
    dbSync(() => db.deleteSeatingRule(id));
  },

  // ── Relationship Engine ──
  addRelationshipGroup: (group) => {
    set((s) => ({ relationshipGroups: [...s.relationshipGroups, group] }));
    dbSync(() => db.upsertRelationshipGroup(group));
  },
  updateRelationshipGroup: (id, updates) => {
    set((s) => ({ relationshipGroups: s.relationshipGroups.map((g) => g.id === id ? { ...g, ...updates } : g) }));
    const fullGroup = get().relationshipGroups.find((g) => g.id === id);
    if (fullGroup) dbSync(() => db.upsertRelationshipGroup(fullGroup));
  },
  removeRelationshipGroup: (id) => {
    set((s) => ({
      relationshipGroups: s.relationshipGroups.filter((g) => g.id !== id),
      relationshipMemberships: s.relationshipMemberships.filter((m) => m.groupId !== id),
    }));
    dbSync(() => db.deleteRelationshipGroup(id));
  },
  addRelationshipMembership: (membership) => {
    set((s) => ({ relationshipMemberships: [...s.relationshipMemberships, membership] }));
    dbSync(() => db.upsertRelationshipMembership(membership));
  },
  removeRelationshipMembership: (id) => {
    set((s) => ({ relationshipMemberships: s.relationshipMemberships.filter((m) => m.id !== id) }));
    dbSync(() => db.deleteRelationshipMembership(id));
  },
  getEventRelationshipGroups: (eventId) => get().relationshipGroups.filter((g) => g.eventId === eventId),
  getGroupMembers: (groupId) => {
    const memberships = get().relationshipMemberships.filter((m) => m.groupId === groupId);
    const guests = get().guests;
    return memberships.map((m) => ({ membership: m, guest: guests.find((g) => g.id === m.guestId)! })).filter((entry) => entry.guest);
  },
  getGuestRelationships: (guestId) => {
    const memberships = get().relationshipMemberships.filter((m) => m.guestId === guestId);
    const groups = get().relationshipGroups;
    return memberships.map((m) => ({ group: groups.find((g) => g.id === m.groupId)!, membership: m })).filter((entry) => entry.group);
  },

  // ── Selectors ──
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

  // Load sample data — idempotent (checks for existing IDs before adding)
  loadSampleData: () => set((s) => {
    const existingEventIds = new Set(s.events.map((e) => e.id));
    const existingGuestIds = new Set(s.guests.map((g) => g.id));
    const existingOrgIds = new Set(s.organizations.map((o) => o.id));
    const existingVersionIds = new Set(s.versions.map((v) => v.id));
    const existingGroupIds = new Set(s.relationshipGroups.map((g) => g.id));
    const existingMembershipIds = new Set(s.relationshipMemberships.map((m) => m.id));

    // Combine mock guests + scholarship seed data
    const allNewGuests = [...mockGuests, ...seedAllGuests].filter((g) => !existingGuestIds.has(g.id));
    const newGroups = seedRelationshipGroups.filter((g) => !existingGroupIds.has(g.id));
    const newMemberships = seedRelationshipMemberships.filter((m) => !existingMembershipIds.has(m.id));

    return {
      hasCompletedOnboarding: true,
      organizations: [...s.organizations, ...mockOrganizations.filter((o) => !existingOrgIds.has(o.id))],
      activeOrgId: s.activeOrgId ?? mockOrganizations[0]?.id ?? null,
      events: [...s.events, ...mockEvents.filter((e) => !existingEventIds.has(e.id))],
      guests: [...s.guests, ...allNewGuests],
      versions: [...s.versions, ...mockVersions.filter((v) => !existingVersionIds.has(v.id))],
      layoutObjects: [...s.layoutObjects, ...mockLayoutObjects.filter((o) => !s.layoutObjects.some((x) => x.id === o.id))],
      seatingAssignments: [...s.seatingAssignments, ...mockSeatingAssignments.filter((a) => !s.seatingAssignments.some((x) => x.id === a.id))],
      seatingRules: [...s.seatingRules, ...mockSeatingRules.filter((r) => !s.seatingRules.some((x) => x.id === r.id))],
      relationshipGroups: [...s.relationshipGroups, ...newGroups],
      relationshipMemberships: [...s.relationshipMemberships, ...newMemberships],
    };
  }),

  // Load scholarship data — 'first' loads donors + first 100 recipients, 'all' loads everything
  loadScholarshipSeedData: (half) => set((s) => {
    const existingGuestIds = new Set(s.guests.map((g) => g.id));
    const existingGroupIds = new Set(s.relationshipGroups.map((g) => g.id));
    const existingMembershipIds = new Set(s.relationshipMemberships.map((m) => m.id));

    const recipientSlice = half === 'first' ? seedRecipients.slice(0, 100) : seedRecipients;
    const newGuests = [...seedDonors, ...recipientSlice].filter((g) => !existingGuestIds.has(g.id));

    // Only include memberships & groups for loaded guests
    const loadedIds = new Set([...existingGuestIds, ...newGuests.map((g) => g.id)]);
    const newMemberships = seedRelationshipMemberships.filter(
      (m) => !existingMembershipIds.has(m.id) && loadedIds.has(m.guestId),
    );
    const neededGroupIds = new Set(newMemberships.map((m) => m.groupId));
    const newGroups = seedRelationshipGroups.filter(
      (g) => !existingGroupIds.has(g.id) && neededGroupIds.has(g.id),
    );

    return {
      guests: [...s.guests, ...newGuests],
      relationshipGroups: [...s.relationshipGroups, ...newGroups],
      relationshipMemberships: [...s.relationshipMemberships, ...newMemberships],
    };
  }),

  // ── Messaging actions (delegated to messaging-store.ts) ──
  ...createMessagingActions(
    (fn) => set((s) => fn(s as unknown as MessagingState) as unknown as Partial<EventStore>),
    () => get() as unknown as MessagingState,
  ),

  resetStore: () => {
    // Keep accounts so users can re-sign-in, but clear session and data
    const accounts = get().accounts;
    set({ ...PERSISTED_DEFAULTS, accounts });
  },
}),
    {
      name: 'event-intelligence-hub-store',
      version: STORE_VERSION,

      // Migrate old store versions to current schema.
      // The key insight: merge saved state ON TOP of defaults so new fields
      // always have valid initial values and existing data is preserved.
      migrate: (persisted: unknown, version: number): PersistedState => {
        const saved = persisted as Partial<PersistedState> | null;
        if (!saved) return { ...PERSISTED_DEFAULTS };

        // For any version → current: merge saved data onto defaults.
        // This ensures new fields (added in newer versions) get their
        // default values, while all existing user data is kept.
        const migrated: PersistedState = { ...PERSISTED_DEFAULTS };
        for (const key of Object.keys(PERSISTED_DEFAULTS) as Array<keyof PersistedState>) {
          if (key in saved && saved[key] !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (migrated as any)[key] = saved[key];
          }
        }

        // v6→v7+: auto-assign tableNumber by spatial position
        if (version < 10 && migrated.layoutObjects) {
          const ROW_THRESHOLD = 50;
          const versionIds = new Set(
            migrated.layoutObjects
              .filter((o) => o.type === 'round_table' || o.type === 'rect_table')
              .map((o) => o.versionId),
          );
          for (const vid of versionIds) {
            const tables = migrated.layoutObjects
              .filter((o) => o.versionId === vid && (o.type === 'round_table' || o.type === 'rect_table'));

            // Cluster into rows by Y, then sort each row by X
            const byY = [...tables].sort((a, b) => a.y - b.y);
            const rows: typeof tables[] = [];
            for (const t of byY) {
              if (rows.length > 0) {
                const lastRow = rows[rows.length - 1];
                const rowAvgY = lastRow.reduce((sum, r) => sum + r.y, 0) / lastRow.length;
                if (Math.abs(t.y - rowAvgY) <= ROW_THRESHOLD) {
                  lastRow.push(t);
                  continue;
                }
              }
              rows.push([t]);
            }
            const sorted = rows.flatMap((row) => row.sort((a, b) => a.x - b.x));

            sorted.forEach((t, i) => {
              const idx = migrated.layoutObjects.indexOf(t);
              if (idx >= 0) {
                migrated.layoutObjects[idx] = { ...t, tableNumber: i + 1, name: `Table ${i + 1}` };
              }
            });
          }
        }

        return migrated;
      },

      // Only persist data fields (not functions/selectors)
      partialize: (state): PersistedState => {
        const result = {} as PersistedState;
        for (const key of Object.keys(PERSISTED_DEFAULTS) as Array<keyof PersistedState>) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result as any)[key] = state[key];
        }
        return result;
      },

      // Merge rehydrated state with store defaults so new fields are
      // always present even if the stored version predates them
      merge: (persisted, current) => {
        const saved = persisted as Partial<PersistedState>;
        return {
          ...current,
          ...saved,
        };
      },
    }
  )
);
