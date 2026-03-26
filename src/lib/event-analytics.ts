import type { AppEvent, EventVersion, Guest, LayoutObject, SeatingAssignment, SeatingRule } from '@/types/events';

const TABLE_TYPES = new Set(['round_table', 'rect_table']);
const FRONT_OF_HOUSE_TYPES = new Set(['checkin', 'registration']);

export interface EventInsight {
  id: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  detail: string;
}

export interface TableSummary {
  tableId: string;
  name: string;
  type: LayoutObject['type'];
  x: number;
  y: number;
  capacity: number;
  assigned: number;
  available: number;
  occupancyRate: number;
  zone: 'front' | 'middle' | 'rear';
  guestIds: string[];
  categoryMix: Record<string, number>;
  accessibilityCount: number;
  notes: string;
}

export interface EventAnalytics {
  event: AppEvent;
  activeVersion?: EventVersion;
  eventGuests: Guest[];
  confirmedGuests: Guest[];
  invitedGuests: Guest[];
  waitlistGuests: Guest[];
  declinedGuests: Guest[];
  checkedInGuests: Guest[];
  tables: LayoutObject[];
  layoutObjects: LayoutObject[];
  assignments: SeatingAssignment[];
  rules: SeatingRule[];
  tableSummaries: TableSummary[];
  totalCapacity: number;
  assignedConfirmed: number;
  unassignedConfirmed: Guest[];
  seatedGuests: Guest[];
  frontTables: TableSummary[];
  readinessScore: number;
  progressLabel: string;
  vipGuests: Guest[];
  accessibilityGuests: Guest[];
  householdsSplitCount: number;
  donorScholarPairsSeated: number;
  donorScholarPairTargets: number;
  frontOfHouseReady: boolean;
  insights: EventInsight[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildEventAnalytics(params: {
  event: AppEvent;
  guests: Guest[];
  versions: EventVersion[];
  layoutObjects: LayoutObject[];
  seatingAssignments: SeatingAssignment[];
  seatingRules: SeatingRule[];
}): EventAnalytics {
  const { event, guests, versions, layoutObjects, seatingAssignments, seatingRules } = params;

  const eventGuests = guests.filter((guest) => guest.eventId === event.id);
  const activeVersion = versions.find((version) => version.id === event.activeVersionId);
  const versionId = activeVersion?.id ?? event.activeVersionId;
  const versionObjects = layoutObjects.filter((object) => object.versionId === versionId);
  const assignments = seatingAssignments.filter((assignment) => assignment.versionId === versionId);
  const rules = seatingRules.filter((rule) => rule.eventId === event.id);

  const tables = versionObjects.filter((object) => TABLE_TYPES.has(object.type));
  const tableMap = new Map(tables.map((table) => [table.id, table]));
  const guestMap = new Map(eventGuests.map((guest) => [guest.id, guest]));
  const guestsByTable = new Map<string, Guest[]>();

  assignments.forEach((assignment) => {
    const guest = guestMap.get(assignment.guestId);
    if (!guest) return;
    const current = guestsByTable.get(assignment.tableId) ?? [];
    current.push(guest);
    guestsByTable.set(assignment.tableId, current);
  });

  const xValues = tables.map((table) => table.x);
  const yValues = tables.map((table) => table.y);
  const avgY = average(yValues);
  const minY = Math.min(...yValues, 0);
  const maxY = Math.max(...yValues, 0);
  const verticalSpan = Math.max(maxY - minY, 1);

  const tableSummaries: TableSummary[] = tables
    .map((table) => {
      const tableGuests = guestsByTable.get(table.id) ?? [];
      const categoryMix = tableGuests.reduce<Record<string, number>>((acc, guest) => {
        acc[guest.category] = (acc[guest.category] ?? 0) + 1;
        return acc;
      }, {});

      let zone: TableSummary['zone'] = 'middle';
      const normalizedY = (table.y - minY) / verticalSpan;
      if (normalizedY < 0.33) zone = 'front';
      else if (normalizedY > 0.66) zone = 'rear';

      return {
        tableId: table.id,
        name: table.name,
        type: table.type,
        x: table.x,
        y: table.y,
        capacity: table.capacity,
        assigned: tableGuests.length,
        available: Math.max(table.capacity - tableGuests.length, 0),
        occupancyRate: table.capacity > 0 ? tableGuests.length / table.capacity : 0,
        zone,
        guestIds: tableGuests.map((guest) => guest.id),
        categoryMix,
        accessibilityCount: tableGuests.filter((guest) => Boolean(guest.accessibilityNeeds)).length,
        notes: table.notes,
      };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const confirmedGuests = eventGuests.filter((guest) => guest.rsvpStatus === 'confirmed');
  const invitedGuests = eventGuests.filter((guest) => guest.rsvpStatus === 'invited');
  const waitlistGuests = eventGuests.filter((guest) => guest.rsvpStatus === 'waitlist');
  const declinedGuests = eventGuests.filter((guest) => guest.rsvpStatus === 'declined');
  const checkedInGuests = eventGuests.filter((guest) => guest.rsvpStatus === 'checked_in');
  const assignedConfirmedIds = new Set(
    assignments
      .map((assignment) => guestMap.get(assignment.guestId))
      .filter((guest): guest is Guest => Boolean(guest && guest.rsvpStatus === 'confirmed'))
      .map((guest) => guest.id),
  );
  const unassignedConfirmed = confirmedGuests.filter((guest) => !assignedConfirmedIds.has(guest.id));
  const seatedGuests = eventGuests.filter((guest) => assignments.some((assignment) => assignment.guestId === guest.id));
  const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);
  const assignedConfirmed = confirmedGuests.length - unassignedConfirmed.length;
  const vipGuests = eventGuests.filter((guest) => guest.category === 'vip' || guest.category === 'board_member');
  const accessibilityGuests = eventGuests.filter((guest) => Boolean(guest.accessibilityNeeds));
  const frontTables = tableSummaries.filter((table) => table.zone === 'front');

  const households = new Map<string, Guest[]>();
  eventGuests.forEach((guest) => {
    if (!guest.householdId) return;
    const current = households.get(guest.householdId) ?? [];
    current.push(guest);
    households.set(guest.householdId, current);
  });

  const tableIdByGuest = new Map(assignments.map((assignment) => [assignment.guestId, assignment.tableId]));
  let householdsSplitCount = 0;
  households.forEach((members) => {
    const tableIds = new Set(members.map((member) => tableIdByGuest.get(member.id)).filter(Boolean));
    if (tableIds.size > 1) householdsSplitCount += 1;
  });

  const donorScholarPairs = [
    ['g-001', 'g-006'],
    ['g-004', 'g-007'],
    ['g-003', 'g-008'],
  ];
  const donorScholarPairsSeated = donorScholarPairs.filter(([donorId, scholarId]) => {
    const donorTable = tableIdByGuest.get(donorId);
    const scholarTable = tableIdByGuest.get(scholarId);
    return donorTable && scholarTable && donorTable === scholarTable;
  }).length;

  const frontOfHouseReady = versionObjects.some((object) => FRONT_OF_HOUSE_TYPES.has(object.type));

  const readinessParts = [
    confirmedGuests.length > 0 ? assignedConfirmed / confirmedGuests.length : 1,
    totalCapacity > 0 ? clamp(confirmedGuests.length / totalCapacity, 0, 1) : 0,
    rules.length > 0 ? rules.filter((rule) => rule.enabled).length / rules.length : 0,
    frontOfHouseReady ? 1 : 0,
    accessibilityGuests.length === 0
      ? 1
      : 1 - clamp(householdsSplitCount / Math.max(accessibilityGuests.length, 1), 0, 1),
  ];

  const readinessScore = Math.round(average(readinessParts) * 100);
  const progressLabel = readinessScore >= 85 ? 'Event-ready' : readinessScore >= 65 ? 'Advancing' : 'Needs work';

  const insights: EventInsight[] = [];

  if (unassignedConfirmed.length > 0) {
    insights.push({
      id: 'unassigned-confirmed',
      severity: unassignedConfirmed.length >= 4 ? 'critical' : 'warning',
      title: `${unassignedConfirmed.length} confirmed guests still need seats`,
      detail: 'Seat confirmed attendees before refining overflow and waitlist strategy.',
    });
  } else {
    insights.push({
      id: 'all-confirmed-seated',
      severity: 'success',
      title: 'All confirmed guests are seated',
      detail: 'The current plan covers every confirmed RSVP in the active version.',
    });
  }

  const nearCapacityTables = tableSummaries.filter((table) => table.occupancyRate >= 0.9);
  if (nearCapacityTables.length > 0) {
    insights.push({
      id: 'near-capacity',
      severity: 'warning',
      title: `${nearCapacityTables.length} table${nearCapacityTables.length === 1 ? '' : 's'} are nearly full`,
      detail: 'Keep a few seats in reserve for late confirmations, VIP moves, and accessibility adjustments.',
    });
  }

  if (!frontOfHouseReady) {
    insights.push({
      id: 'checkin-missing',
      severity: 'critical',
      title: 'Front-of-house setup is incomplete',
      detail: 'Add check-in or registration positions so operators know where arrivals flow.',
    });
  }

  if (donorScholarPairsSeated < donorScholarPairs.length) {
    insights.push({
      id: 'donor-pairs',
      severity: 'info',
      title: `${donorScholarPairsSeated}/${donorScholarPairs.length} donor-scholar pairings satisfied`,
      detail: 'There is still room to tighten relationship-driven seating around scholarships and recognition moments.',
    });
  }

  if (householdsSplitCount > 0) {
    insights.push({
      id: 'split-households',
      severity: 'warning',
      title: `${householdsSplitCount} household group${householdsSplitCount === 1 ? '' : 's'} split across tables`,
      detail: 'Keeping family units together usually reduces friction at check-in and on the floor.',
    });
  }

  if (invitedGuests.length > 0 || waitlistGuests.length > 0) {
    insights.push({
      id: 'rsvp-pipeline',
      severity: 'info',
      title: `${invitedGuests.length} invited · ${waitlistGuests.length} waitlist`,
      detail: 'Use this pipeline to reserve flex seats and model likely last-minute moves.',
    });
  }

  return {
    event,
    activeVersion,
    eventGuests,
    confirmedGuests,
    invitedGuests,
    waitlistGuests,
    declinedGuests,
    checkedInGuests,
    tables,
    layoutObjects: versionObjects,
    assignments,
    rules,
    tableSummaries,
    totalCapacity,
    assignedConfirmed,
    unassignedConfirmed,
    seatedGuests,
    frontTables,
    readinessScore,
    progressLabel,
    vipGuests,
    accessibilityGuests,
    householdsSplitCount,
    donorScholarPairsSeated,
    donorScholarPairTargets: donorScholarPairs.length,
    frontOfHouseReady,
    insights,
  };
}
