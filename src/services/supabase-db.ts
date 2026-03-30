import { supabase } from '@/integrations/supabase/client';
import type {
  Organization,
  AppEvent,
  Guest,
  LayoutObject,
  EventVersion,
  SeatingAssignment,
  SeatingRule,
  RelationshipGroup,
  RelationshipMembership,
  EventCollaborator,
  TeamInvite,
  OrgMember,
} from '@/types/events';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function throwOnError<T>(result: { data: T; error: { message: string } | null }, context: string): T {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}

// ──────────────────────────────────────────────
// Organization
// ──────────────────────────────────────────────

export function rowToOrganization(row: any): Organization {
  // Parse LLM config from the settings JSONB column
  const settings = row.settings ?? {};
  const llmCfg = settings.llm_config;
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    logoUrl: row.logo_url ?? undefined,
    primaryColor: row.primary_color ?? undefined,
    llmConfig: llmCfg?.provider && llmCfg?.api_key
      ? { provider: llmCfg.provider, apiKey: llmCfg.api_key, model: llmCfg.model }
      : undefined,
    createdAt: row.created_at,
  };
}

export function organizationToRow(org: Partial<Organization>) {
  const row: Record<string, unknown> = {};
  if (org.name !== undefined) row.name = org.name;
  if (org.shortName !== undefined) row.short_name = org.shortName;
  if (org.logoUrl !== undefined) row.logo_url = org.logoUrl;
  if (org.primaryColor !== undefined) row.primary_color = org.primaryColor;
  if (org.id !== undefined) row.id = org.id;
  if (org.llmConfig !== undefined) {
    row.settings = {
      llm_config: {
        provider: org.llmConfig.provider,
        api_key: org.llmConfig.apiKey,
        model: org.llmConfig.model,
      },
    };
  }
  return row;
}

export async function fetchOrgMemberships(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId);
  throwOnError({ data, error }, 'fetchOrgMemberships');
  return (data ?? []).map((r: any) => r.org_id);
}

export async function createOrgWithMember(org: Organization, userId: string): Promise<void> {
  const row = organizationToRow(org);
  row.created_by = userId;
  const orgResult = await supabase.from('organizations').insert(row as any);
  throwOnError(orgResult, 'createOrgWithMember (insert org)');

  const memberId = `member-${crypto.randomUUID().slice(0, 8)}`;
  const memberResult = await supabase.from('org_members').insert({
    id: memberId,
    org_id: org.id,
    user_id: userId,
    role: 'owner',
  } as any);
  throwOnError(memberResult, 'createOrgWithMember (insert member)');
}

export async function upsertOrganization(org: Organization): Promise<void> {
  const row = organizationToRow(org);
  const result = await supabase
    .from('organizations')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertOrganization');
}

export async function fetchOrganizations(orgIds: string[]): Promise<Organization[]> {
  if (orgIds.length === 0) return [];
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .in('id', orgIds);
  throwOnError({ data, error }, 'fetchOrganizations');
  return (data ?? []).map(rowToOrganization);
}

// ──────────────────────────────────────────────
// Event
// ──────────────────────────────────────────────

export function rowToEvent(row: any): AppEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    type: row.type,
    status: row.status,
    date: row.date,
    time: row.time,
    venue: row.venue,
    venueAddress: row.venue_address,
    estimatedAttendance: row.estimated_attendance,
    notes: row.notes,
    activeVersionId: row.active_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function eventToRow(event: Partial<AppEvent>) {
  const row: Record<string, unknown> = {};
  if (event.id !== undefined) row.id = event.id;
  if (event.orgId !== undefined) row.org_id = event.orgId;
  if (event.name !== undefined) row.name = event.name;
  if (event.type !== undefined) row.type = event.type;
  if (event.status !== undefined) row.status = event.status;
  if (event.date !== undefined) row.date = event.date;
  if (event.time !== undefined) row.time = event.time;
  if (event.venue !== undefined) row.venue = event.venue;
  if (event.venueAddress !== undefined) row.venue_address = event.venueAddress;
  if (event.estimatedAttendance !== undefined) row.estimated_attendance = event.estimatedAttendance;
  if (event.notes !== undefined) row.notes = event.notes;
  if (event.activeVersionId !== undefined) row.active_version_id = event.activeVersionId;
  return row;
}

export async function fetchEvents(orgId: string): Promise<AppEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('org_id', orgId);
  throwOnError({ data, error }, 'fetchEvents');
  return (data ?? []).map(rowToEvent);
}

export async function upsertEvent(event: AppEvent): Promise<void> {
  const row = eventToRow(event);
  const result = await supabase
    .from('events')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertEvent');
}

export async function deleteEvent(id: string): Promise<void> {
  const result = await supabase.from('events').delete().eq('id', id);
  throwOnError(result, 'deleteEvent');
}

// ──────────────────────────────────────────────
// Guest
// ──────────────────────────────────────────────

export function rowToGuest(row: any): Guest {
  return {
    id: row.id,
    orgId: row.org_id,
    eventId: row.event_id,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    organization: row.organization,
    category: row.category,
    rsvpStatus: row.rsvp_status,
    partySize: row.party_size,
    dietaryRestrictions: row.dietary_restrictions,
    accessibilityNeeds: row.accessibility_needs,
    notes: row.notes,
    relationshipTags: row.relationship_tags ?? [],
    tablePreference: row.table_preference,
    seatingPreference: row.seating_preference,
    plusOneId: row.plus_one_id ?? undefined,
    householdId: row.household_id ?? undefined,
  };
}

export function guestToRow(guest: Partial<Guest>) {
  const row: Record<string, unknown> = {};
  if (guest.id !== undefined) row.id = guest.id;
  if (guest.orgId !== undefined) row.org_id = guest.orgId;
  if (guest.eventId !== undefined) row.event_id = guest.eventId;
  if (guest.firstName !== undefined) row.first_name = guest.firstName;
  if (guest.lastName !== undefined) row.last_name = guest.lastName;
  if (guest.displayName !== undefined) row.display_name = guest.displayName;
  if (guest.email !== undefined) row.email = guest.email;
  if (guest.phone !== undefined) row.phone = guest.phone;
  if (guest.organization !== undefined) row.organization = guest.organization;
  if (guest.category !== undefined) row.category = guest.category;
  if (guest.rsvpStatus !== undefined) row.rsvp_status = guest.rsvpStatus;
  if (guest.partySize !== undefined) row.party_size = guest.partySize;
  if (guest.dietaryRestrictions !== undefined) row.dietary_restrictions = guest.dietaryRestrictions;
  if (guest.accessibilityNeeds !== undefined) row.accessibility_needs = guest.accessibilityNeeds;
  if (guest.notes !== undefined) row.notes = guest.notes;
  if (guest.relationshipTags !== undefined) row.relationship_tags = guest.relationshipTags;
  if (guest.tablePreference !== undefined) row.table_preference = guest.tablePreference;
  if (guest.seatingPreference !== undefined) row.seating_preference = guest.seatingPreference;
  if (guest.plusOneId !== undefined) row.plus_one_id = guest.plusOneId;
  if (guest.householdId !== undefined) row.household_id = guest.householdId;
  return row;
}

export async function fetchGuests(orgId: string): Promise<Guest[]> {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('org_id', orgId);
  throwOnError({ data, error }, 'fetchGuests');
  return (data ?? []).map(rowToGuest);
}

export async function upsertGuest(guest: Guest): Promise<void> {
  const row = guestToRow(guest);
  const result = await supabase
    .from('guests')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertGuest');
}

export async function deleteGuest(id: string): Promise<void> {
  const result = await supabase.from('guests').delete().eq('id', id);
  throwOnError(result, 'deleteGuest');
}

// ──────────────────────────────────────────────
// EventVersion
// ──────────────────────────────────────────────

export function rowToVersion(row: any): EventVersion {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    notes: row.notes,
  };
}

export function versionToRow(version: Partial<EventVersion>) {
  const row: Record<string, unknown> = {};
  if (version.id !== undefined) row.id = version.id;
  if (version.eventId !== undefined) row.event_id = version.eventId;
  if (version.name !== undefined) row.name = version.name;
  if (version.status !== undefined) row.status = version.status;
  if (version.createdBy !== undefined) row.created_by = version.createdBy;
  if (version.notes !== undefined) row.notes = version.notes;
  return row;
}

export async function fetchVersions(eventIds: string[]): Promise<EventVersion[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase
    .from('event_versions')
    .select('*')
    .in('event_id', eventIds);
  throwOnError({ data, error }, 'fetchVersions');
  return (data ?? []).map(rowToVersion);
}

export async function upsertVersion(version: EventVersion): Promise<void> {
  const row = versionToRow(version);
  const result = await supabase
    .from('event_versions')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertVersion');
}

// ──────────────────────────────────────────────
// LayoutObject
// ──────────────────────────────────────────────

export function rowToLayoutObject(row: any): LayoutObject {
  return {
    id: row.id,
    versionId: row.version_id,
    type: row.type,
    name: row.name,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    capacity: row.capacity,
    notes: row.notes,
    category: row.category,
    parentId: row.parent_id ?? undefined,
    locked: row.locked,
    visible: row.visible,
    zIndex: row.z_index,
  };
}

export function layoutObjectToRow(obj: Partial<LayoutObject>) {
  const row: Record<string, unknown> = {};
  if (obj.id !== undefined) row.id = obj.id;
  if (obj.versionId !== undefined) row.version_id = obj.versionId;
  if (obj.type !== undefined) row.type = obj.type;
  if (obj.name !== undefined) row.name = obj.name;
  if (obj.x !== undefined) row.x = obj.x;
  if (obj.y !== undefined) row.y = obj.y;
  if (obj.width !== undefined) row.width = obj.width;
  if (obj.height !== undefined) row.height = obj.height;
  if (obj.rotation !== undefined) row.rotation = obj.rotation;
  if (obj.capacity !== undefined) row.capacity = obj.capacity;
  if (obj.notes !== undefined) row.notes = obj.notes;
  if (obj.category !== undefined) row.category = obj.category;
  if (obj.parentId !== undefined) row.parent_id = obj.parentId;
  if (obj.locked !== undefined) row.locked = obj.locked;
  if (obj.visible !== undefined) row.visible = obj.visible;
  if (obj.zIndex !== undefined) row.z_index = obj.zIndex;
  return row;
}

export async function fetchLayoutObjects(versionIds: string[]): Promise<LayoutObject[]> {
  if (versionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('layout_objects')
    .select('*')
    .in('version_id', versionIds);
  throwOnError({ data, error }, 'fetchLayoutObjects');
  return (data ?? []).map(rowToLayoutObject);
}

export async function upsertLayoutObject(obj: LayoutObject): Promise<void> {
  const row = layoutObjectToRow(obj);
  const result = await supabase
    .from('layout_objects')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertLayoutObject');
}

export async function deleteLayoutObject(id: string): Promise<void> {
  const result = await supabase.from('layout_objects').delete().eq('id', id);
  throwOnError(result, 'deleteLayoutObject');
}

// ──────────────────────────────────────────────
// SeatingAssignment
// ──────────────────────────────────────────────

export function rowToSeatingAssignment(row: any): SeatingAssignment {
  return {
    id: row.id,
    versionId: row.version_id,
    guestId: row.guest_id,
    tableId: row.table_id,
    seatNumber: row.seat_number ?? undefined,
  };
}

export function seatingAssignmentToRow(a: Partial<SeatingAssignment>) {
  const row: Record<string, unknown> = {};
  if (a.id !== undefined) row.id = a.id;
  if (a.versionId !== undefined) row.version_id = a.versionId;
  if (a.guestId !== undefined) row.guest_id = a.guestId;
  if (a.tableId !== undefined) row.table_id = a.tableId;
  if (a.seatNumber !== undefined) row.seat_number = a.seatNumber;
  return row;
}

export async function fetchSeatingAssignments(versionIds: string[]): Promise<SeatingAssignment[]> {
  if (versionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('seating_assignments')
    .select('*')
    .in('version_id', versionIds);
  throwOnError({ data, error }, 'fetchSeatingAssignments');
  return (data ?? []).map(rowToSeatingAssignment);
}

export async function upsertSeatingAssignment(a: SeatingAssignment): Promise<void> {
  const row = seatingAssignmentToRow(a);
  const result = await supabase
    .from('seating_assignments')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertSeatingAssignment');
}

export async function deleteSeatingAssignment(id: string): Promise<void> {
  const result = await supabase.from('seating_assignments').delete().eq('id', id);
  throwOnError(result, 'deleteSeatingAssignment');
}

// ──────────────────────────────────────────────
// SeatingRule
// ──────────────────────────────────────────────

export function rowToSeatingRule(row: any): SeatingRule {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    priority: row.priority,
    ruleType: row.rule_type ?? undefined,
    tag: row.tag ?? undefined,
    tagA: row.tag_a ?? undefined,
    tagB: row.tag_b ?? undefined,
    relationshipGroupId: row.relationship_group_id ?? undefined,
    intent: row.intent ?? undefined,
  };
}

export function seatingRuleToRow(rule: Partial<SeatingRule>) {
  const row: Record<string, unknown> = {};
  if (rule.id !== undefined) row.id = rule.id;
  if (rule.eventId !== undefined) row.event_id = rule.eventId;
  if (rule.name !== undefined) row.name = rule.name;
  if (rule.description !== undefined) row.description = rule.description;
  if (rule.enabled !== undefined) row.enabled = rule.enabled;
  if (rule.priority !== undefined) row.priority = rule.priority;
  if (rule.ruleType !== undefined) row.rule_type = rule.ruleType;
  if (rule.tag !== undefined) row.tag = rule.tag;
  if (rule.tagA !== undefined) row.tag_a = rule.tagA;
  if (rule.tagB !== undefined) row.tag_b = rule.tagB;
  if (rule.relationshipGroupId !== undefined) row.relationship_group_id = rule.relationshipGroupId;
  if (rule.intent !== undefined) row.intent = rule.intent;
  return row;
}

export async function fetchSeatingRules(eventIds: string[]): Promise<SeatingRule[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase
    .from('seating_rules')
    .select('*')
    .in('event_id', eventIds);
  throwOnError({ data, error }, 'fetchSeatingRules');
  return (data ?? []).map(rowToSeatingRule);
}

export async function upsertSeatingRule(rule: SeatingRule): Promise<void> {
  const row = seatingRuleToRow(rule);
  const result = await supabase
    .from('seating_rules')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertSeatingRule');
}

export async function deleteSeatingRule(id: string): Promise<void> {
  const result = await supabase.from('seating_rules').delete().eq('id', id);
  throwOnError(result, 'deleteSeatingRule');
}

// ──────────────────────────────────────────────
// RelationshipGroup
// ──────────────────────────────────────────────

export function rowToRelationshipGroup(row: any): RelationshipGroup {
  return {
    id: row.id,
    eventId: row.event_id,
    orgId: row.org_id,
    name: row.name,
    type: row.type,
    color: row.color ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export function relationshipGroupToRow(group: Partial<RelationshipGroup>) {
  const row: Record<string, unknown> = {};
  if (group.id !== undefined) row.id = group.id;
  if (group.eventId !== undefined) row.event_id = group.eventId;
  if (group.orgId !== undefined) row.org_id = group.orgId;
  if (group.name !== undefined) row.name = group.name;
  if (group.type !== undefined) row.type = group.type;
  if (group.color !== undefined) row.color = group.color;
  if (group.notes !== undefined) row.notes = group.notes;
  return row;
}

export async function fetchRelationshipGroups(orgId: string): Promise<RelationshipGroup[]> {
  const { data, error } = await supabase
    .from('relationship_groups')
    .select('*')
    .eq('org_id', orgId);
  throwOnError({ data, error }, 'fetchRelationshipGroups');
  return (data ?? []).map(rowToRelationshipGroup);
}

export async function upsertRelationshipGroup(group: RelationshipGroup): Promise<void> {
  const row = relationshipGroupToRow(group);
  const result = await supabase
    .from('relationship_groups')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertRelationshipGroup');
}

export async function deleteRelationshipGroup(id: string): Promise<void> {
  const result = await supabase.from('relationship_groups').delete().eq('id', id);
  throwOnError(result, 'deleteRelationshipGroup');
}

// ──────────────────────────────────────────────
// RelationshipMembership
// ──────────────────────────────────────────────

export function rowToRelationshipMembership(row: any): RelationshipMembership {
  return {
    id: row.id,
    groupId: row.group_id,
    guestId: row.guest_id,
    role: row.role,
  };
}

export function relationshipMembershipToRow(m: Partial<RelationshipMembership>) {
  const row: Record<string, unknown> = {};
  if (m.id !== undefined) row.id = m.id;
  if (m.groupId !== undefined) row.group_id = m.groupId;
  if (m.guestId !== undefined) row.guest_id = m.guestId;
  if (m.role !== undefined) row.role = m.role;
  return row;
}

export async function fetchRelationshipMemberships(groupIds: string[]): Promise<RelationshipMembership[]> {
  if (groupIds.length === 0) return [];
  const { data, error } = await supabase
    .from('relationship_memberships')
    .select('*')
    .in('group_id', groupIds);
  throwOnError({ data, error }, 'fetchRelationshipMemberships');
  return (data ?? []).map(rowToRelationshipMembership);
}

export async function upsertRelationshipMembership(m: RelationshipMembership): Promise<void> {
  const row = relationshipMembershipToRow(m);
  const result = await supabase
    .from('relationship_memberships')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertRelationshipMembership');
}

export async function deleteRelationshipMembership(id: string): Promise<void> {
  const result = await supabase.from('relationship_memberships').delete().eq('id', id);
  throwOnError(result, 'deleteRelationshipMembership');
}

// ──────────────────────────────────────────────
// EventCollaborator
// ──────────────────────────────────────────────

export function rowToCollaborator(row: any): EventCollaborator {
  return {
    id: row.id,
    eventId: row.event_id,
    email: row.email,
    name: row.name,
    role: row.role,
    invitedBy: row.invited_by,
    invitedAt: row.invited_at,
    status: row.status,
  };
}

export function collaboratorToRow(c: Partial<EventCollaborator>) {
  const row: Record<string, unknown> = {};
  if (c.id !== undefined) row.id = c.id;
  if (c.eventId !== undefined) row.event_id = c.eventId;
  if (c.email !== undefined) row.email = c.email;
  if (c.name !== undefined) row.name = c.name;
  if (c.role !== undefined) row.role = c.role;
  if (c.invitedBy !== undefined) row.invited_by = c.invitedBy;
  if (c.invitedAt !== undefined) row.invited_at = c.invitedAt;
  if (c.status !== undefined) row.status = c.status;
  return row;
}

export async function fetchCollaborators(eventIds: string[]): Promise<EventCollaborator[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase
    .from('collaborators')
    .select('*')
    .in('event_id', eventIds);
  throwOnError({ data, error }, 'fetchCollaborators');
  return (data ?? []).map(rowToCollaborator);
}

export async function upsertCollaborator(c: EventCollaborator): Promise<void> {
  const row = collaboratorToRow(c);
  const result = await supabase
    .from('collaborators')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertCollaborator');
}

export async function deleteCollaborator(id: string): Promise<void> {
  const result = await supabase.from('collaborators').delete().eq('id', id);
  throwOnError(result, 'deleteCollaborator');
}

// ──────────────────────────────────────────────
// TeamInvite
// ──────────────────────────────────────────────

function rowToTeamInvite(row: any): TeamInvite {
  return {
    id: row.id,
    orgId: row.org_id,
    inviteCode: row.invite_code,
    role: row.role,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    // DB uses status/use_count instead of usedBy/usedAt
    usedBy: row.status === 'used' ? 'redeemed' : undefined,
    usedAt: row.status === 'used' ? row.created_at : undefined,
  };
}

export async function upsertTeamInvite(invite: TeamInvite): Promise<void> {
  const row: Record<string, unknown> = {
    id: invite.id,
    org_id: invite.orgId,
    invite_code: invite.inviteCode,
    role: invite.role,
    created_by: invite.createdBy,
    created_at: invite.createdAt,
    expires_at: invite.expiresAt,
    status: invite.usedBy ? 'used' : 'active',
    use_count: invite.usedBy ? 1 : 0,
    max_uses: 1,
  };
  const result = await supabase
    .from('team_invites')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertTeamInvite');
}

export async function fetchTeamInviteByCode(code: string): Promise<TeamInvite | null> {
  const { data, error } = await supabase
    .from('team_invites')
    .select('*')
    .eq('invite_code', code)
    .maybeSingle();
  if (error) throw new Error(`fetchTeamInviteByCode: ${error.message}`);
  if (!data) return null;
  return rowToTeamInvite(data);
}

export async function fetchTeamInvites(orgId: string): Promise<TeamInvite[]> {
  const { data, error } = await supabase
    .from('team_invites')
    .select('*')
    .eq('org_id', orgId);
  throwOnError({ data, error }, 'fetchTeamInvites');
  return (data ?? []).map(rowToTeamInvite);
}

// ──────────────────────────────────────────────
// OrgMember (additional helpers)
// ──────────────────────────────────────────────

export async function fetchOrgMembers(orgIds: string[]): Promise<OrgMember[]> {
  if (orgIds.length === 0) return [];
  const { data, error } = await supabase
    .from('org_members')
    .select('*')
    .in('org_id', orgIds);
  throwOnError({ data, error }, 'fetchOrgMembers');
  return (data ?? []).map((r: any): OrgMember => ({
    id: r.id,
    orgId: r.org_id,
    userId: r.user_id,
    role: r.role,
    joinedAt: r.joined_at,
    inviteId: r.invite_id ?? undefined,
  }));
}

export async function upsertOrgMember(member: OrgMember): Promise<void> {
  const row: Record<string, unknown> = {
    id: member.id,
    org_id: member.orgId,
    user_id: member.userId,
    role: member.role,
    joined_at: member.joinedAt,
  };
  const result = await supabase
    .from('org_members')
    .upsert(row as any, { onConflict: 'id' });
  throwOnError(result, 'upsertOrgMember');
}

export async function deleteOrgMember(memberId: string): Promise<void> {
  const result = await supabase
    .from('org_members')
    .delete()
    .eq('id', memberId);
  throwOnError(result, 'deleteOrgMember');
}

export async function deleteTeamInvite(inviteId: string): Promise<void> {
  const result = await supabase
    .from('team_invites')
    .delete()
    .eq('id', inviteId);
  throwOnError(result, 'deleteTeamInvite');
}
