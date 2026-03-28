import type { RSVPStatus, GuestCategory, Guest, LayoutObject } from '@/types/events';

// ---------------------------------------------------------------------------
// Event Health / Readiness Scoring
// ---------------------------------------------------------------------------

/** Aggregate health score for an event across key dimensions (0-100 each). */
export interface EventHealthScore {
  /** Weighted composite of all dimensions. */
  overall: number;
  /** Percentage of invited guests who confirmed. */
  guestConfirmation: number;
  /** Percentage of confirmed guests who have a seating assignment. */
  seatingCompletion: number;
  /** Whether table capacity can accommodate confirmed attendance. */
  layoutReadiness: number;
  /** Percentage of guests who have received at least one communication. */
  communicationStatus: number;
}

// ---------------------------------------------------------------------------
// AI-Generated Insights & Recommendations
// ---------------------------------------------------------------------------

export type InsightType = 'alert' | 'recommendation' | 'milestone' | 'action_needed';
export type InsightPriority = 'critical' | 'high' | 'medium' | 'low';
export type InsightCategory = 'guests' | 'seating' | 'layout' | 'communications' | 'logistics';
export type InsightActionType =
  | 'send_reminders'
  | 'auto_seat'
  | 'review_guests'
  | 'optimize_seating'
  | 'check_layout';

export interface OrchestratorInsight {
  id: string;
  eventId: string;
  type: InsightType;
  priority: InsightPriority;
  category: InsightCategory;
  title: string;
  description: string;
  /** CTA label shown in the UI, e.g. "Send Reminders", "Auto-Seat". */
  actionLabel?: string;
  actionType?: InsightActionType;
  metadata?: Record<string, unknown>;
  createdAt: string;
  dismissed: boolean;
}

// ---------------------------------------------------------------------------
// Guest Analytics
// ---------------------------------------------------------------------------

export interface GuestAnalytics {
  total: number;
  byStatus: Record<RSVPStatus, number>;
  byCategory: Record<GuestCategory, number>;
  /** Percentage of non-declined guests who have confirmed. */
  confirmationRate: number;
  /** VIPs, donors, and board members whose RSVP is not yet confirmed. */
  pendingHighPriority: Guest[];
  /** Guests who confirmed recently (simulated: a subset of confirmed guests). */
  recentConfirmations: Guest[];
  /** Guests whose status is still 'invited' — they need follow-up. */
  needsFollowUp: Guest[];
  /** Aggregated count of each dietary restriction string. */
  dietarySummary: Record<string, number>;
  /** Guests who specified accessibility needs. */
  accessibilityNeeds: Guest[];
  /** Number of plus-one guests (those with a plusOneId). */
  plusOneCount: number;
  /** Sum of partySize for confirmed and checked-in guests. */
  totalExpectedAttendance: number;
}

// ---------------------------------------------------------------------------
// Seating Analytics
// ---------------------------------------------------------------------------

export interface TableUtilization {
  table: LayoutObject;
  seated: number;
  capacity: number;
  utilizationPct: number;
  hasAnchor: boolean;
  anchorGroupName?: string;
}

export interface SeatingAnalytics {
  totalTables: number;
  totalCapacity: number;
  seatedGuests: number;
  unseatedConfirmed: number;
  tableUtilization: TableUtilization[];
  averageUtilization: number;
  emptyTables: number;
  fullTables: number;
  overCapacityTables: number;
  /** Relationship groups where every member is seated at the same table. */
  relationshipGroupsComplete: number;
  /** Relationship groups with some (but not all) members seated together. */
  relationshipGroupsPartial: number;
  /** Relationship groups with no members seated at all. */
  relationshipGroupsUnseated: number;
}

// ---------------------------------------------------------------------------
// Communications
// ---------------------------------------------------------------------------

export type CommTemplateType =
  | 'rsvp_reminder'
  | 'confirmation_thanks'
  | 'table_assignment'
  | 'event_update'
  | 'custom';

export interface CommTemplate {
  id: string;
  type: CommTemplateType;
  name: string;
  subject: string;
  /** Email body with {{placeholder}} tokens. */
  bodyTemplate: string;
  /** Which guest categories this template applies to, or 'all'. */
  applicableTo: GuestCategory[] | 'all';
}

export interface CommRecord {
  id: string;
  eventId: string;
  guestId: string;
  templateId: string;
  type: CommTemplateType;
  subject: string;
  sentAt: string;
  status: 'sent' | 'pending' | 'failed';
}

// ---------------------------------------------------------------------------
// Orchestrator Action Results
// ---------------------------------------------------------------------------

export interface OrchestratorActionResult {
  success: boolean;
  message: string;
  affectedGuestIds?: string[];
  affectedTableIds?: string[];
  insightsGenerated?: OrchestratorInsight[];
}

// ---------------------------------------------------------------------------
// Event Timeline & Milestones
// ---------------------------------------------------------------------------

export type MilestoneCategory =
  | 'planning'
  | 'invitations'
  | 'confirmations'
  | 'seating'
  | 'logistics'
  | 'day_of';

export interface EventMilestone {
  id: string;
  label: string;
  description: string;
  dueDate?: string;
  completed: boolean;
  category: MilestoneCategory;
}
