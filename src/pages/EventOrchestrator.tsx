import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Heart, Users, LayoutGrid, Mail, Sparkles, Play, Check,
  Clock, ChevronRight, Send, Eye, UserCheck, UtensilsCrossed,
  Accessibility, PartyPopper, TrendingUp, Armchair,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useEventStore } from '@/data/store';
import { HealthScoreCard } from '@/components/orchestrator/HealthScoreCard';
import { InsightCard } from '@/components/orchestrator/InsightCard';
import {
  computeEventHealth,
  analyzeGuests,
  analyzeSeating,
  generateInsights,
  generateEventTimeline,
  getDefaultCommTemplates,
  renderTemplate,
} from '@/services/orchestrator';
import { generateSeatingProposal, getSeatingRecommendations } from '@/services/smart-seating';
import type { OrchestratorInsight, CommRecord } from '@/types/orchestrator';
import type { SeatingProposal } from '@/services/smart-seating';

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-emerald-500',
  checked_in: 'bg-emerald-600',
  invited: 'bg-amber-500',
  waitlist: 'bg-blue-500',
  declined: 'bg-rose-400',
};

const CATEGORY_COLORS: Record<string, string> = {
  donor: 'bg-violet-500',
  scholarship_recipient: 'bg-emerald-500',
  board_member: 'bg-blue-600',
  vip: 'bg-amber-500',
  sponsor: 'bg-orange-500',
  family: 'bg-rose-400',
  staff: 'bg-slate-500',
  volunteer: 'bg-teal-500',
  dignitary: 'bg-purple-500',
  other: 'bg-gray-400',
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function EventOrchestrator() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const store = useEventStore();

  const event = store.getOrgEvents().find((e) => e.id === eventId);
  const eventGuests = useMemo(
    () => store.guests.filter((g) => g.eventId === eventId),
    [store.guests, eventId],
  );
  const versions = useMemo(
    () => store.versions.filter((v) => v.eventId === eventId),
    [store.versions, eventId],
  );
  const activeVersion = versions.find((v) => v.id === event?.activeVersionId) ?? versions[0];
  const versionId = activeVersion?.id ?? '';
  const tables = useMemo(
    () => store.layoutObjects.filter(
      (o) => o.versionId === versionId && (o.type === 'round_table' || o.type === 'rect_table'),
    ),
    [store.layoutObjects, versionId],
  );
  const assignments = useMemo(
    () => store.seatingAssignments.filter((a) => a.versionId === versionId),
    [store.seatingAssignments, versionId],
  );
  const groups = useMemo(
    () => store.relationshipGroups.filter((g) => g.eventId === eventId),
    [store.relationshipGroups, eventId],
  );
  const memberships = useMemo(
    () => store.relationshipMemberships.filter((m) =>
      groups.some((g) => g.id === m.groupId),
    ),
    [store.relationshipMemberships, groups],
  );

  // ── Analytics (memoized) ──
  const healthScore = useMemo(
    () => event ? computeEventHealth(event, eventGuests, tables, assignments, versions) : null,
    [event, eventGuests, tables, assignments, versions],
  );
  const guestAnalytics = useMemo(
    () => eventId ? analyzeGuests(store.guests, eventId) : null,
    [store.guests, eventId],
  );
  const seatingAnalytics = useMemo(
    () => analyzeSeating(tables, assignments, eventGuests, groups, memberships, versionId),
    [tables, assignments, eventGuests, groups, memberships, versionId],
  );
  const insights = useMemo(
    () => event && guestAnalytics && healthScore
      ? generateInsights(event, guestAnalytics, seatingAnalytics, healthScore)
      : [],
    [event, guestAnalytics, seatingAnalytics, healthScore],
  );
  const timeline = useMemo(
    () => event && guestAnalytics ? generateEventTimeline(event, guestAnalytics) : [],
    [event, guestAnalytics],
  );
  const templates = useMemo(() => getDefaultCommTemplates(), []);
  const recommendations = useMemo(
    () => getSeatingRecommendations({
      tables, guests: eventGuests.filter((g) => g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in'),
      existingAssignments: assignments, relationshipGroups: groups,
      relationshipMemberships: memberships, versionId,
    }),
    [tables, eventGuests, assignments, groups, memberships, versionId],
  );

  // ── Local State ──
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [proposal, setProposal] = useState<SeatingProposal | null>(null);
  const [commRecords, setCommRecords] = useState<CommRecord[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.id ?? '');
  const [previewGuestId, setPreviewGuestId] = useState<string | null>(null);

  if (!event || !healthScore || !guestAnalytics) {
    return (
      <div className="flex items-center justify-center h-full py-32">
        <p className="text-muted-foreground">Event not found</p>
      </div>
    );
  }

  const daysLeft = daysUntil(event.date);
  const activeInsights = insights.filter((i) => !dismissedIds.has(i.id));

  // ── Handlers ──
  function handleDismiss(id: string) {
    setDismissedIds((prev) => new Set(prev).add(id));
  }

  function handleInsightAction(insight: OrchestratorInsight) {
    if (insight.actionType === 'auto_seat') handleAutoSeat();
    else if (insight.actionType === 'check_layout') navigate(`/events/${eventId}/layout`);
    else if (insight.actionType === 'review_guests') navigate(`/events/${eventId}/guests`);
    else if (insight.actionType === 'send_reminders') toast.success(`Reminders queued for ${(insight.metadata?.guestIds as string[])?.length ?? 0} guests`);
    else if (insight.actionType === 'optimize_seating') handleAutoSeat();
  }

  function handleAutoSeat() {
    const confirmed = eventGuests.filter((g) => g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in');
    const result = generateSeatingProposal({
      tables, guests: confirmed, existingAssignments: assignments,
      relationshipGroups: groups, relationshipMemberships: memberships, versionId,
    });
    setProposal(result);
  }

  function applyProposal() {
    if (!proposal) return;
    for (const a of proposal.assignments) {
      store.assignGuestToSeat(a.guestId, a.tableId, a.seatNumber, versionId);
    }
    toast.success(`Seated ${proposal.assignments.length} guests across ${proposal.summary.tablesUsed} tables`);
    setProposal(null);
  }

  function handleSendComms(guestIds: string[]) {
    const template = templates.find((t) => t.id === selectedTemplate);
    if (!template) return;
    const records: CommRecord[] = guestIds.map((gId) => ({
      id: crypto.randomUUID(),
      eventId: event!.id,
      guestId: gId,
      templateId: template.id,
      type: template.type,
      subject: template.subject,
      sentAt: new Date().toISOString(),
      status: 'sent' as const,
    }));
    setCommRecords((prev) => [...prev, ...records]);
    toast.success(`Sent ${records.length} emails`);
  }

  function handleSeatRecommendation(guestId: string, tableId: string) {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;
    const occupied = assignments.filter((a) => a.tableId === tableId).map((a) => a.seatNumber ?? 0);
    let seat = 1;
    while (occupied.includes(seat) && seat <= table.capacity) seat++;
    if (seat > table.capacity) {
      toast.error(`${table.name} is full — no available seats.`);
      return;
    }
    store.assignGuestToSeat(guestId, tableId, seat, versionId);
    const guest = eventGuests.find((g) => g.id === guestId);
    toast.success(`Seated ${guest?.firstName ?? 'Guest'} at ${table.name}`);
  }

  // ── Render ──
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-600/10 text-violet-500">
                <Sparkles className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
            </div>
            <p className="text-sm text-muted-foreground">{event.name}</p>
          </div>
          <div className="text-right">
            <p className={cn('text-2xl font-bold font-mono', daysLeft <= 7 ? 'text-rose-500' : daysLeft <= 30 ? 'text-amber-500' : 'text-emerald-500')}>
              {daysLeft > 0 ? `${daysLeft}d` : daysLeft === 0 ? 'Today' : 'Passed'}
            </p>
            <p className="text-xs text-muted-foreground">{daysLeft > 0 ? 'until event' : ''}</p>
          </div>
        </div>

        {/* Health Score Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthScoreCard
            icon={<Heart className="w-4 h-4" />}
            label="Overall Health"
            score={healthScore.overall}
            detail={`${daysLeft > 0 ? daysLeft + ' days left' : 'Event day'}`}
          />
          <HealthScoreCard
            icon={<UserCheck className="w-4 h-4" />}
            label="Confirmations"
            score={healthScore.guestConfirmation}
            detail={`${guestAnalytics.byStatus.confirmed + guestAnalytics.byStatus.checked_in} of ${guestAnalytics.total} confirmed`}
          />
          <HealthScoreCard
            icon={<Armchair className="w-4 h-4" />}
            label="Seating"
            score={healthScore.seatingCompletion}
            detail={`${seatingAnalytics.seatedGuests} seated, ${seatingAnalytics.unseatedConfirmed} pending`}
          />
          <HealthScoreCard
            icon={<Mail className="w-4 h-4" />}
            label="Communications"
            score={healthScore.communicationStatus}
            detail={`${commRecords.length} emails sent`}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="insights" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="insights" className="gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              Insights
              {activeInsights.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeInsights.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="guests" className="gap-2">
              <Users className="w-3.5 h-3.5" />
              Guest Intel
            </TabsTrigger>
            <TabsTrigger value="seating" className="gap-2">
              <LayoutGrid className="w-3.5 h-3.5" />
              Seating AI
            </TabsTrigger>
            <TabsTrigger value="comms" className="gap-2">
              <Mail className="w-3.5 h-3.5" />
              Communications
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Insights ── */}
          <TabsContent value="insights" className="space-y-4">
            {/* Timeline */}
            <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Event Timeline
              </h3>
              <div className="space-y-3">
                {timeline.map((ms) => (
                  <div key={ms.id} className="flex items-center gap-3">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                      ms.completed ? 'bg-emerald-500/20 text-emerald-500' : 'bg-muted text-muted-foreground',
                    )}>
                      {ms.completed ? <Check className="w-3.5 h-3.5" /> : <div className="w-2 h-2 rounded-full bg-current" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', ms.completed && 'text-muted-foreground line-through')}>{ms.label}</p>
                    </div>
                    {ms.dueDate && (
                      <span className="text-xs text-muted-foreground font-mono">{ms.dueDate}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Insights Feed */}
            {activeInsights.length > 0 ? (
              <div className="space-y-3">
                {activeInsights.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onAction={handleInsightAction}
                    onDismiss={handleDismiss}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <PartyPopper className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Everything looks great — no action items right now.</p>
              </div>
            )}
          </TabsContent>

          {/* ── Tab: Guest Intel ── */}
          <TabsContent value="guests" className="space-y-6">
            {/* RSVP Funnel */}
            <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold mb-4">RSVP Status Breakdown</h3>
              <div className="flex h-8 rounded-full overflow-hidden bg-muted/30">
                {(['confirmed', 'checked_in', 'invited', 'waitlist', 'declined'] as const).map((status) => {
                  const count = guestAnalytics.byStatus[status];
                  const pct = guestAnalytics.total > 0 ? (count / guestAnalytics.total) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={status}
                      className={cn('flex items-center justify-center text-white text-[10px] font-bold transition-all', STATUS_COLORS[status])}
                      style={{ width: `${pct}%` }}
                      title={`${status}: ${count}`}
                    >
                      {pct > 8 && count}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-4 mt-3">
                {(['confirmed', 'invited', 'waitlist', 'declined'] as const).map((status) => (
                  <div key={status} className="flex items-center gap-2">
                    <div className={cn('w-2.5 h-2.5 rounded-full', STATUS_COLORS[status])} />
                    <span className="text-xs text-muted-foreground capitalize">{status}: {guestAnalytics.byStatus[status]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold mb-4">Guest Categories</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(guestAnalytics.byCategory)
                  .filter(([, count]) => count > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, count]) => (
                    <div key={cat} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30">
                      <div className={cn('w-3 h-3 rounded-full shrink-0', CATEGORY_COLORS[cat] ?? 'bg-gray-400')} />
                      <span className="text-xs font-medium capitalize flex-1">{cat.replace(/_/g, ' ')}</span>
                      <span className="text-xs font-mono text-muted-foreground">{count}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* High-Priority Pending */}
            {guestAnalytics.pendingHighPriority.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-sm p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <TrendingUp className="w-4 h-4" />
                  High-Priority Awaiting Response ({guestAnalytics.pendingHighPriority.length})
                </h3>
                <div className="space-y-2">
                  {guestAnalytics.pendingHighPriority.map((g) => (
                    <div key={g.id} className="flex items-center justify-between p-2.5 rounded-lg bg-card/60">
                      <div>
                        <p className="text-sm font-medium">{g.firstName} {g.lastName}</p>
                        <p className="text-xs text-muted-foreground capitalize">{g.category.replace(/_/g, ' ')}{g.organization ? ` · ${g.organization}` : ''}</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled title="Email integration coming soon">
                        <Send className="w-3 h-3" />
                        Remind
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dietary + Accessibility */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(guestAnalytics.dietarySummary).length > 0 && (
                <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <UtensilsCrossed className="w-4 h-4 text-muted-foreground" />
                    Dietary Needs
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(guestAnalytics.dietarySummary).map(([restriction, count]) => (
                      <div key={restriction} className="flex items-center justify-between">
                        <span className="text-xs capitalize">{restriction}</span>
                        <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {guestAnalytics.accessibilityNeeds.length > 0 && (
                <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Accessibility className="w-4 h-4 text-muted-foreground" />
                    Accessibility ({guestAnalytics.accessibilityNeeds.length})
                  </h3>
                  <div className="space-y-2">
                    {guestAnalytics.accessibilityNeeds.map((g) => (
                      <div key={g.id}>
                        <p className="text-xs font-medium">{g.firstName} {g.lastName}</p>
                        <p className="text-xs text-muted-foreground">{g.accessibilityNeeds}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Attendance projection */}
            <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold mb-2">Attendance Projection</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold font-mono text-emerald-500">{guestAnalytics.totalExpectedAttendance}</p>
                  <p className="text-xs text-muted-foreground">Confirmed Headcount</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono text-amber-500">{guestAnalytics.byStatus.invited}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono">{guestAnalytics.plusOneCount}</p>
                  <p className="text-xs text-muted-foreground">Plus-Ones</p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab: Seating AI ── */}
          <TabsContent value="seating" className="space-y-6">
            {/* Current Score */}
            <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Seating Overview</h3>
                <Button onClick={handleAutoSeat} className="gap-2">
                  <Play className="w-3.5 h-3.5" />
                  Auto-Seat All
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xl font-bold font-mono">{seatingAnalytics.totalTables}</p>
                  <p className="text-xs text-muted-foreground">Tables</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xl font-bold font-mono">{seatingAnalytics.seatedGuests}</p>
                  <p className="text-xs text-muted-foreground">Seated</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xl font-bold font-mono text-amber-500">{seatingAnalytics.unseatedConfirmed}</p>
                  <p className="text-xs text-muted-foreground">Unseated</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xl font-bold font-mono">{seatingAnalytics.averageUtilization}%</p>
                  <p className="text-xs text-muted-foreground">Avg Utilization</p>
                </div>
              </div>
            </div>

            {/* Table utilization */}
            {seatingAnalytics.tableUtilization.length > 0 && (
              <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5">
                <h3 className="text-sm font-semibold mb-4">Table Utilization</h3>
                <div className="space-y-2.5">
                  {seatingAnalytics.tableUtilization.map((t) => (
                    <div key={t.table.id} className="flex items-center gap-3">
                      <span className="text-xs font-medium w-28 truncate">{t.table.name}</span>
                      <div className="flex-1 h-5 rounded-full bg-muted/30 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            t.utilizationPct > 100 ? 'bg-rose-500' : t.utilizationPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500',
                          )}
                          style={{ width: `${Math.min(t.utilizationPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-14 text-right">{t.seated}/{t.capacity}</span>
                      {t.hasAnchor && (
                        <Badge variant="outline" className="text-[9px] px-1.5">{t.anchorGroupName}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Proposal Preview */}
            {proposal && (
              <div className="rounded-xl border-2 border-violet-500/30 bg-violet-500/5 backdrop-blur-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-violet-600 dark:text-violet-400">
                    Seating Proposal Preview
                  </h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setProposal(null)}>Cancel</Button>
                    <Button size="sm" className="gap-1.5" onClick={applyProposal}>
                      <Check className="w-3.5 h-3.5" />
                      Apply ({proposal.assignments.length} seats)
                    </Button>
                  </div>
                </div>

                {/* Score */}
                <div className="grid grid-cols-5 gap-3 text-center">
                  {[
                    { label: 'Overall', score: proposal.score.overall },
                    { label: 'Relations', score: proposal.score.relationshipSatisfaction },
                    { label: 'Category', score: proposal.score.categoryClustering },
                    { label: 'Balance', score: proposal.score.utilizationBalance },
                    { label: 'Preference', score: proposal.score.preferenceSatisfaction },
                  ].map((s) => (
                    <div key={s.label} className="p-2 rounded-lg bg-card/60">
                      <p className={cn('text-lg font-bold font-mono', s.score >= 80 ? 'text-emerald-500' : s.score >= 50 ? 'text-amber-500' : 'text-rose-500')}>
                        {s.score}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Seated: <strong className="text-foreground">{proposal.summary.totalSeated}</strong></span>
                  <span>Unseated: <strong className="text-foreground">{proposal.summary.totalUnseated}</strong></span>
                  <span>Groups complete: <strong className="text-foreground">{proposal.summary.groupsFullySeated}</strong></span>
                  <span>Tables used: <strong className="text-foreground">{proposal.summary.tablesUsed}</strong></span>
                </div>

                {/* Log */}
                <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/20 p-3 space-y-1">
                  {proposal.log.map((line, i) => (
                    <p key={i} className="text-xs text-muted-foreground font-mono">{line}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Individual Recommendations */}
            {recommendations.length > 0 && !proposal && (
              <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5">
                <h3 className="text-sm font-semibold mb-4">Seating Recommendations</h3>
                <div className="space-y-2">
                  {recommendations.slice(0, 10).map((rec) => {
                    const guest = eventGuests.find((g) => g.id === rec.guestId);
                    const table = tables.find((t) => t.id === rec.tableId);
                    if (!guest || !table) return null;
                    return (
                      <div key={`${rec.guestId}-${rec.tableId}`} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{guest.firstName} {guest.lastName}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <ChevronRight className="w-3 h-3" />
                            {table.name} — {rec.reason}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                          onClick={() => handleSeatRecommendation(rec.guestId, rec.tableId)}>
                          Seat
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Tab: Communications ── */}
          <TabsContent value="comms" className="space-y-6">
            {/* Template Selector + Preview */}
            <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5 space-y-4">
              <h3 className="text-sm font-semibold">Compose Communication</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Template buttons */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-2">Select Template</p>
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTemplate(t.id); setPreviewGuestId(eventGuests[0]?.id ?? null); }}
                      className={cn(
                        'w-full text-left p-3 rounded-lg border transition-all',
                        selectedTemplate === t.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                      )}
                    >
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                    </button>
                  ))}
                </div>

                {/* Preview */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Eye className="w-3 h-3" /> Preview
                  </p>
                  {(() => {
                    const tpl = templates.find((t) => t.id === selectedTemplate);
                    const guest = eventGuests.find((g) => g.id === previewGuestId) ?? eventGuests[0];
                    if (!tpl || !guest) return <p className="text-xs text-muted-foreground">Select a template</p>;
                    const rendered = renderTemplate(tpl, guest, event);
                    return (
                      <div className="rounded-lg border bg-card p-4 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground">Subject:</p>
                        <p className="text-sm font-medium">{rendered.subject}</p>
                        <hr />
                        <div className="text-xs whitespace-pre-wrap text-muted-foreground leading-relaxed">{rendered.body}</div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Quick Send */}
            <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5 space-y-4">
              <h3 className="text-sm font-semibold">Quick Send</h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => handleSendComms(guestAnalytics?.needsFollowUp.map((g) => g.id) ?? [])}>
                  <Send className="w-3 h-3" />
                  All Pending ({guestAnalytics.needsFollowUp.length})
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => handleSendComms(guestAnalytics?.pendingHighPriority.map((g) => g.id) ?? [])}>
                  <Send className="w-3 h-3" />
                  VIP Pending ({guestAnalytics.pendingHighPriority.length})
                </Button>
              </div>
            </div>

            {/* History */}
            {commRecords.length > 0 && (
              <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5">
                <h3 className="text-sm font-semibold mb-3">Communication History ({commRecords.length})</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {commRecords.slice().reverse().map((rec) => {
                    const guest = eventGuests.find((g) => g.id === rec.guestId);
                    return (
                      <div key={rec.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{guest?.firstName} {guest?.lastName}</p>
                          <p className="text-[10px] text-muted-foreground">{rec.type.replace(/_/g, ' ')}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(rec.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
