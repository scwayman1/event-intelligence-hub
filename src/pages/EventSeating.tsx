import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { buildEventAnalytics } from '@/lib/event-analytics';
import { evaluateRules } from '@/lib/rule-engine';
import { CreateSeatingRuleDialog } from '@/components/CreateSeatingRuleDialog';
import { SeatingBoard } from '@/components/seating/SeatingBoard';
import { GuestDragCard } from '@/components/seating/GuestDragCard';
import { toast } from 'sonner';

type RsvpFilterTab = 'confirmed' | 'all' | 'invited' | 'waitlist';

const RSVP_TABS: { key: RsvpFilterTab; label: string }[] = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'all', label: 'All' },
  { key: 'invited', label: 'Invited' },
  { key: 'waitlist', label: 'Waitlist' },
];

export default function EventSeating() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const guests = useEventStore((s) => s.guests);
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);
  const relationshipGroups = useEventStore((s) => s.relationshipGroups);
  const relationshipMemberships = useEventStore((s) => s.relationshipMemberships);
  const updateSeatingRule = useEventStore((s) => s.updateSeatingRule);
  const removeSeatingRule = useEventStore((s) => s.removeSeatingRule);
  const assignGuestToSeat = useEventStore((s) => s.assignGuestToSeat);
  const unassignGuestFromSeat = useEventStore((s) => s.unassignGuestFromSeat);
  const autoAssignByRelationshipGroup = useEventStore((s) => s.autoAssignByRelationshipGroup);
  const getGuestRelationships = useEventStore((s) => s.getGuestRelationships);

  const event = events.find((item) => item.id === eventId);
  if (!event) return <div className="p-8 text-muted-foreground">Event not found</div>;

  const analytics = buildEventAnalytics({
    event,
    guests,
    versions,
    layoutObjects,
    seatingAssignments,
    seatingRules,
  });
  const versionId = event.activeVersionId;
  const tables = analytics.tables;
  const assignments = analytics.assignments;
  const rules = analytics.rules;

  const assignedGuestIds = new Set(assignments.map((a) => a.guestId));

  const [search, setSearch] = useState('');
  const [rsvpTab, setRsvpTab] = useState<RsvpFilterTab>('confirmed');
  const [showRules, setShowRules] = useState(false);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [autoAssignedIds, setAutoAssignedIds] = useState<Set<string>>(new Set());

  // Evaluate tag-based rules
  const ruleEvaluations = useMemo(
    () => evaluateRules(rules, analytics.eventGuests, assignments, tables),
    [rules, analytics.eventGuests, assignments, tables],
  );
  const satisfiedRules = ruleEvaluations.filter((e) => e.status === 'satisfied').length;
  const violatedRules = ruleEvaluations.filter(
    (e) => e.status === 'violated' || e.status === 'partial',
  ).length;

  // Guests for RSVP filter tabs
  const tabGuestMap: Record<RsvpFilterTab, typeof analytics.eventGuests> = {
    confirmed: analytics.confirmedGuests,
    all: analytics.eventGuests,
    invited: analytics.invitedGuests,
    waitlist: analytics.waitlistGuests,
  };

  const tabCounts: Record<RsvpFilterTab, number> = {
    confirmed: analytics.confirmedGuests.length,
    all: analytics.eventGuests.length,
    invited: analytics.invitedGuests.length,
    waitlist: analytics.waitlistGuests.length,
  };

  const tabGuests = tabGuestMap[rsvpTab];
  const unassignedInTab = tabGuests.filter((g) => !assignedGuestIds.has(g.id));

  const filteredUnassigned = unassignedInTab.filter((g) =>
    `${g.firstName} ${g.lastName} ${g.organization} ${g.notes}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  // Total unassigned confirmed for header stat
  const unassignedConfirmedCount = analytics.unassignedConfirmed.length;

  // ── Drop handler ──────────────────────────────────────────────────────────
  const handleDropGuest = (guestId: string, tableId: string, seatNumber: number) => {
    assignGuestToSeat(guestId, tableId, seatNumber, versionId);

    const autoIds = autoAssignByRelationshipGroup(guestId, tableId, versionId);

    if (autoIds.length > 0) {
      const tableName =
        analytics.tableSummaries.find((t) => t.tableId === tableId)?.name ?? 'table';
      const names = autoIds
        .map((id) => guests.find((g) => g.id === id)?.displayName ?? id)
        .filter(Boolean);

      toast.success(`${autoIds.length} related guest${autoIds.length === 1 ? '' : 's'} auto-assigned to ${tableName}`, {
        description: names.join(', '),
      });

      const newSet = new Set<string>(autoIds);
      setAutoAssignedIds(newSet);

      setTimeout(() => {
        setAutoAssignedIds((prev) => {
          const next = new Set(prev);
          autoIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 3000);
    }
  };

  const handleUnseatGuest = (guestId: string) => {
    unassignGuestFromSeat(guestId, versionId);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left panel ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary/80 mb-2">
              <Sparkles className="w-3.5 h-3.5" /> seating orchestration
            </div>
            <h1 className="text-3xl font-bold text-foreground">Seating plan</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tables.length} tables · {assignments.length} assigned ·{' '}
              <span className="text-warning">{unassignedConfirmedCount} unassigned confirmed</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRules(!showRules)}
              className="gap-2"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Rules
              {ruleEvaluations.length > 0 && (
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full ml-1',
                    violatedRules > 0
                      ? 'bg-destructive/20 text-destructive'
                      : 'bg-success/20 text-success',
                  )}
                >
                  {satisfiedRules}/{ruleEvaluations.length}
                </span>
              )}
            </Button>
            <Button size="sm" onClick={() => setShowCreateRule(true)} className="gap-2">
              <Plus className="w-3.5 h-3.5" />
              Add Rule
            </Button>
          </div>
        </div>

        {/* Metrics cards */}
        <div className="grid gap-3 md:grid-cols-4">
          <div className="metric-card">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Readiness</div>
            <p className="text-2xl font-bold font-mono text-foreground">
              {analytics.readinessScore}
            </p>
            <p className="text-xs text-muted-foreground">Composite event score.</p>
          </div>
          <div className="metric-card">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Confirmed seated
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">
              {analytics.assignedConfirmed}/{analytics.confirmedGuests.length}
            </p>
            <p className="text-xs text-muted-foreground">Coverage against confirmed RSVP.</p>
          </div>
          <div className="metric-card">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Donor-scholar match
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">
              {analytics.donorScholarPairsSeated}/{analytics.donorScholarPairTargets}
            </p>
            <p className="text-xs text-muted-foreground">Relationship seating progress.</p>
          </div>
          <div className="metric-card">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Tag rules</div>
            <p
              className={cn(
                'text-2xl font-bold font-mono',
                violatedRules > 0 ? 'text-destructive' : 'text-success',
              )}
            >
              {satisfiedRules}/{ruleEvaluations.length}
            </p>
            <p className="text-xs text-muted-foreground">
              {violatedRules > 0 ? `${violatedRules} need attention` : 'All rules satisfied'}
            </p>
          </div>
        </div>

        {/* Rules panel */}
        {showRules && (
          <div className="glass-panel p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Seating rules</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateRule(true)}
                className="gap-1.5 h-7 text-xs"
              >
                <Plus className="w-3 h-3" /> Add rule
              </Button>
            </div>

            {rules.length === 0 && (
              <div className="text-center py-6 space-y-2">
                <Tag className="w-6 h-6 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No seating rules yet.</p>
                <p className="text-xs text-muted-foreground">
                  Create tag-based rules to automate who sits together.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {rules.map((rule) => {
                const evaluation = ruleEvaluations.find((e) => e.rule.id === rule.id);
                const statusIcon = evaluation
                  ? evaluation.status === 'satisfied' ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : evaluation.status === 'violated' ? (
                    <X className="w-3.5 h-3.5 text-destructive" />
                  ) : evaluation.status === 'partial' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  ) : null
                  : null;

                return (
                  <div
                    key={rule.id}
                    className={cn(
                      'rounded-lg border p-3 transition-all',
                      !rule.enabled && 'opacity-50',
                      evaluation?.status === 'violated'
                        ? 'border-destructive/30 bg-destructive/5'
                        : evaluation?.status === 'partial'
                        ? 'border-warning/30 bg-warning/5'
                        : evaluation?.status === 'satisfied'
                        ? 'border-success/30 bg-success/5'
                        : 'border-border bg-muted/20',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1">
                        <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5">
                          P{rule.priority}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{rule.name}</p>
                            {statusIcon}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>

                          {/* Tags */}
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {rule.tag && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-primary/10 border-primary/30 text-primary"
                              >
                                <Tag className="w-2.5 h-2.5 mr-1" />
                                {rule.tag}
                              </Badge>
                            )}
                            {rule.tagA && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-primary/10 border-primary/30 text-primary"
                              >
                                <Tag className="w-2.5 h-2.5 mr-1" />
                                {rule.tagA}
                              </Badge>
                            )}
                            {rule.tagB && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-accent/10 border-accent/30 text-accent"
                              >
                                <Tag className="w-2.5 h-2.5 mr-1" />
                                {rule.tagB}
                              </Badge>
                            )}
                            {rule.intent && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px]',
                                  rule.intent === 'same_table'
                                    ? 'bg-success/10 border-success/30 text-success'
                                    : rule.intent === 'separate'
                                    ? 'bg-destructive/10 border-destructive/30 text-destructive'
                                    : 'bg-info/10 border-info/30 text-info',
                                )}
                              >
                                {rule.intent === 'same_table'
                                  ? 'Same table'
                                  : rule.intent === 'separate'
                                  ? 'Keep apart'
                                  : 'Nearby'}
                              </Badge>
                            )}
                          </div>

                          {/* Violations */}
                          {evaluation && evaluation.violations.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {evaluation.violations.slice(0, 3).map((v, i) => (
                                <p key={i} className="text-xs text-destructive">
                                  {v.detail}
                                </p>
                              ))}
                              {evaluation.violations.length > 3 && (
                                <p className="text-xs text-muted-foreground">
                                  +{evaluation.violations.length - 3} more
                                </p>
                              )}
                            </div>
                          )}

                          {evaluation?.status === 'satisfied' && (
                            <p className="text-xs text-success mt-1">Rule satisfied</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => updateSeatingRule(rule.id, { enabled: !rule.enabled })}
                          className={cn(
                            'w-8 h-5 rounded-full transition-colors relative',
                            rule.enabled ? 'bg-primary' : 'bg-muted-foreground/30',
                          )}
                        >
                          <div
                            className={cn(
                              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                              rule.enabled ? 'left-3.5' : 'left-0.5',
                            )}
                          />
                        </button>
                        <button
                          onClick={() => removeSeatingRule(rule.id)}
                          className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Visual seating board */}
        <SeatingBoard
          tables={tables}
          assignments={assignments}
          guests={guests}
          relationshipGroups={relationshipGroups}
          relationshipMemberships={relationshipMemberships}
          versionId={versionId}
          autoAssignedIds={autoAssignedIds}
          onDropGuest={handleDropGuest}
          onUnseatGuest={handleUnseatGuest}
        />
      </div>

      {/* ── Right sidebar ── */}
      <div className="w-80 border-l border-border bg-card/50 flex flex-col overflow-hidden">
        {/* Sidebar header */}
        <div className="p-4 border-b border-border space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-warning" />
            <h3 className="text-sm font-semibold text-foreground">Guest queue</h3>
            <span className="text-xs font-mono text-warning ml-auto">
              {unassignedConfirmedCount}
            </span>
          </div>

          {/* RSVP filter tabs */}
          <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
            {RSVP_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setRsvpTab(tab.key)}
                className={cn(
                  'flex-1 text-[11px] font-medium px-1.5 py-1 rounded-md transition-colors',
                  rsvpTab === tab.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'ml-1 text-[10px] font-mono',
                    rsvpTab === tab.key ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {tabCounts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search guests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted border-border"
            />
          </div>
        </div>

        {/* Guest card list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredUnassigned.map((guest) => {
            const relationships = getGuestRelationships(guest.id);
            return (
              <GuestDragCard
                key={guest.id}
                guest={guest}
                relationships={relationships}
                isAssigned={false}
              />
            );
          })}

          {filteredUnassigned.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              {unassignedInTab.length === 0
                ? rsvpTab === 'confirmed'
                  ? 'All confirmed guests are seated.'
                  : `No unassigned ${rsvpTab} guests.`
                : 'No matches for your search.'}
            </p>
          )}
        </div>
      </div>

      <CreateSeatingRuleDialog
        open={showCreateRule}
        onOpenChange={setShowCreateRule}
        eventId={eventId!}
      />
    </div>
  );
}
