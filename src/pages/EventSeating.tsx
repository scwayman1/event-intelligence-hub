import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useMemo, useState } from 'react';
import { AlertTriangle, Check, MoveRight, Plus, Search, Settings2, Sparkles, Tag, Trash2, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { buildEventAnalytics } from '@/lib/event-analytics';
import { evaluateRules } from '@/lib/rule-engine';
import { CreateSeatingRuleDialog } from '@/components/CreateSeatingRuleDialog';
import type { Guest, GuestCategory } from '@/types/events';

const categoryColors: Record<GuestCategory, string> = {
  donor: 'bg-accent/20 text-accent', scholarship_recipient: 'bg-primary/20 text-primary',
  family: 'bg-muted text-muted-foreground', board_member: 'bg-info/20 text-info',
  vip: 'bg-warning/20 text-warning', staff: 'bg-muted text-muted-foreground',
  sponsor: 'bg-accent/15 text-accent', volunteer: 'bg-success/15 text-success',
  other: 'bg-muted text-muted-foreground',
};

export default function EventSeating() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const guests = useEventStore((s) => s.guests);
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);
  const moveGuestToTable = useEventStore((s) => s.moveGuestToTable);
  const updateSeatingRule = useEventStore((s) => s.updateSeatingRule);
  const removeSeatingRule = useEventStore((s) => s.removeSeatingRule);

  const event = events.find((item) => item.id === eventId);
  if (!event) return <div className="p-8 text-muted-foreground">Event not found</div>;

  const analytics = buildEventAnalytics({ event, guests, versions, layoutObjects, seatingAssignments, seatingRules });
  const versionId = event.activeVersionId;
  const tables = analytics.tables;
  const assignments = analytics.assignments;
  const rules = analytics.rules;

  const assignedGuestIds = new Set(assignments.map((a) => a.guestId));
  const unassignedGuests = analytics.confirmedGuests.filter((g) => !assignedGuestIds.has(g.id));

  const [search, setSearch] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [dragGuest, setDragGuest] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(tables[0]?.id ?? null);

  // Evaluate tag-based rules
  const ruleEvaluations = useMemo(
    () => evaluateRules(rules, analytics.eventGuests, assignments, tables),
    [rules, analytics.eventGuests, assignments, tables]
  );
  const satisfiedRules = ruleEvaluations.filter((e) => e.status === 'satisfied').length;
  const violatedRules = ruleEvaluations.filter((e) => e.status === 'violated' || e.status === 'partial').length;

  const filteredUnassigned = unassignedGuests.filter((g) =>
    `${g.firstName} ${g.lastName} ${g.organization} ${g.notes}`.toLowerCase().includes(search.toLowerCase())
  );

  const getTableGuests = (tableId: string): Guest[] => {
    const guestIds = assignments.filter((a) => a.tableId === tableId).map((a) => a.guestId);
    return guests.filter((g) => guestIds.includes(g.id));
  };

  const selectedTableSummary = analytics.tableSummaries.find((table) => table.tableId === selectedTableId) ?? analytics.tableSummaries[0];
  const selectedTableGuests = selectedTableSummary ? getTableGuests(selectedTableSummary.tableId) : [];

  const quickSeatCandidates = useMemo(() => {
    if (!selectedTableSummary) return [];
    return filteredUnassigned
      .map((guest) => {
        const matchesPreference = guest.tablePreference?.toLowerCase().includes(selectedTableSummary.name.toLowerCase()) ? 2 : 0;
        const sameZoneBoost = selectedTableSummary.zone === 'front' && (guest.category === 'vip' || guest.category === 'board_member') ? 2 : 0;
        const accessibilityBoost = guest.accessibilityNeeds && selectedTableSummary.zone !== 'rear' ? 1 : 0;
        const relationshipBoost = guest.seatingPreference ? 1 : 0;
        return { guest, score: matchesPreference + sameZoneBoost + accessibilityBoost + relationshipBoost };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [filteredUnassigned, selectedTableSummary]);

  const handleDrop = (tableId: string) => {
    if (dragGuest) {
      moveGuestToTable(dragGuest, tableId, versionId);
      setDragGuest(null);
      setSelectedTableId(tableId);
    }
  };

  return (
    <div className="flex h-screen">
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary/80 mb-2">
              <Sparkles className="w-3.5 h-3.5" /> seating orchestration
            </div>
            <h1 className="text-3xl font-bold text-foreground">Seating plan</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tables.length} tables · {assignments.length} assigned · <span className="text-warning">{unassignedGuests.length} unassigned confirmed</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowRules(!showRules)} className="gap-2">
              <Settings2 className="w-3.5 h-3.5" />
              Rules
              {ruleEvaluations.length > 0 && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full ml-1',
                  violatedRules > 0 ? 'bg-destructive/20 text-destructive' : 'bg-success/20 text-success'
                )}>
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

        <div className="grid gap-3 md:grid-cols-4">
          <div className="metric-card">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Readiness</div>
            <p className="text-2xl font-bold font-mono text-foreground">{analytics.readinessScore}</p>
            <p className="text-xs text-muted-foreground">Composite event score.</p>
          </div>
          <div className="metric-card">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Confirmed seated</div>
            <p className="text-2xl font-bold font-mono text-foreground">{analytics.assignedConfirmed}/{analytics.confirmedGuests.length}</p>
            <p className="text-xs text-muted-foreground">Coverage against confirmed RSVP.</p>
          </div>
          <div className="metric-card">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Donor-scholar match</div>
            <p className="text-2xl font-bold font-mono text-foreground">{analytics.donorScholarPairsSeated}/{analytics.donorScholarPairTargets}</p>
            <p className="text-xs text-muted-foreground">Relationship seating progress.</p>
          </div>
          <div className="metric-card">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Tag rules</div>
            <p className={cn('text-2xl font-bold font-mono', violatedRules > 0 ? 'text-destructive' : 'text-success')}>
              {satisfiedRules}/{ruleEvaluations.length}
            </p>
            <p className="text-xs text-muted-foreground">{violatedRules > 0 ? `${violatedRules} need attention` : 'All rules satisfied'}</p>
          </div>
        </div>

        {showRules && (
          <div className="glass-panel p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Seating rules</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateRule(true)} className="gap-1.5 h-7 text-xs">
                <Plus className="w-3 h-3" /> Add rule
              </Button>
            </div>

            {rules.length === 0 && (
              <div className="text-center py-6 space-y-2">
                <Tag className="w-6 h-6 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No seating rules yet.</p>
                <p className="text-xs text-muted-foreground">Create tag-based rules to automate who sits together.</p>
              </div>
            )}

            <div className="space-y-2">
              {rules.map((rule) => {
                const evaluation = ruleEvaluations.find((e) => e.rule.id === rule.id);
                const statusIcon = evaluation
                  ? evaluation.status === 'satisfied' ? <Check className="w-3.5 h-3.5 text-success" />
                    : evaluation.status === 'violated' ? <X className="w-3.5 h-3.5 text-destructive" />
                    : evaluation.status === 'partial' ? <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                    : null
                  : null;

                return (
                  <div key={rule.id} className={cn(
                    'rounded-lg border p-3 transition-all',
                    !rule.enabled && 'opacity-50',
                    evaluation?.status === 'violated' ? 'border-destructive/30 bg-destructive/5' :
                    evaluation?.status === 'partial' ? 'border-warning/30 bg-warning/5' :
                    evaluation?.status === 'satisfied' ? 'border-success/30 bg-success/5' :
                    'border-border bg-muted/20'
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1">
                        <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5">P{rule.priority}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{rule.name}</p>
                            {statusIcon}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>

                          {/* Show tags */}
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {rule.tag && (
                              <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary">
                                <Tag className="w-2.5 h-2.5 mr-1" />{rule.tag}
                              </Badge>
                            )}
                            {rule.tagA && (
                              <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary">
                                <Tag className="w-2.5 h-2.5 mr-1" />{rule.tagA}
                              </Badge>
                            )}
                            {rule.tagB && (
                              <Badge variant="outline" className="text-[10px] bg-accent/10 border-accent/30 text-accent">
                                <Tag className="w-2.5 h-2.5 mr-1" />{rule.tagB}
                              </Badge>
                            )}
                            {rule.intent && (
                              <Badge variant="outline" className={cn(
                                'text-[10px]',
                                rule.intent === 'same_table' ? 'bg-success/10 border-success/30 text-success' :
                                rule.intent === 'separate' ? 'bg-destructive/10 border-destructive/30 text-destructive' :
                                'bg-info/10 border-info/30 text-info'
                              )}>
                                {rule.intent === 'same_table' ? 'Same table' : rule.intent === 'separate' ? 'Keep apart' : 'Nearby'}
                              </Badge>
                            )}
                          </div>

                          {/* Show violations */}
                          {evaluation && evaluation.violations.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {evaluation.violations.slice(0, 3).map((v, i) => (
                                <p key={i} className="text-xs text-destructive">{v.detail}</p>
                              ))}
                              {evaluation.violations.length > 3 && (
                                <p className="text-xs text-muted-foreground">+{evaluation.violations.length - 3} more</p>
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
                            rule.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                          )}
                        >
                          <div className={cn(
                            'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                            rule.enabled ? 'left-3.5' : 'left-0.5'
                          )} />
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tables.map((table) => {
            const tableGuests = getTableGuests(table.id);
            const overCapacity = tableGuests.length > table.capacity;
            const summary = analytics.tableSummaries.find((item) => item.tableId === table.id);
            const isSelected = selectedTableId === table.id;

            return (
              <div
                key={table.id}
                className={cn(
                  'glass-panel p-4 transition-all cursor-pointer',
                  overCapacity && 'border-destructive/50',
                  dragGuest && 'border-dashed border-primary/30 hover:border-primary/60',
                  isSelected && 'ring-1 ring-primary border-primary/40'
                )}
                onClick={() => setSelectedTableId(table.id)}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => handleDrop(table.id)}
              >
                <div className="flex items-center justify-between mb-3 gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{table.name}</h4>
                    {summary && <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{summary.zone} zone</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {overCapacity && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                    <span className={cn('text-xs font-mono', overCapacity ? 'text-destructive' : 'text-muted-foreground')}>
                      {tableGuests.length}/{table.capacity}
                    </span>
                  </div>
                </div>

                <div className="h-1 bg-muted rounded-full mb-3 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', overCapacity ? 'bg-destructive' : 'bg-primary')}
                    style={{ width: `${Math.min((tableGuests.length / table.capacity) * 100, 100)}%` }}
                  />
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {summary && Object.entries(summary.categoryMix).map(([category, count]) => (
                    <Badge key={category} variant="outline" className="text-[10px] border-border text-muted-foreground">
                      {category.replace('_', ' ')} · {count}
                    </Badge>
                  ))}
                </div>

                <div className="space-y-1">
                  {tableGuests.map((guest) => (
                    <div
                      key={guest.id}
                      draggable
                      onDragStart={() => setDragGuest(guest.id)}
                      className="py-1.5 px-2 rounded-md bg-muted/30 hover:bg-muted/50 cursor-grab text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <MoveRight className="w-3 h-3 text-muted-foreground" />
                        <span className="text-foreground flex-1 truncate">{guest.displayName}</span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', categoryColors[guest.category])}>
                          {guest.category.replace('_', ' ')}
                        </span>
                      </div>
                      {guest.relationshipTags.length > 0 && (
                        <div className="flex gap-1 mt-1 ml-5 flex-wrap">
                          {guest.relationshipTags.map((t) => (
                            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/70 border border-primary/20">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {tableGuests.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">No guests assigned</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-80 border-l border-border bg-card/50 flex flex-col">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-warning" />
            <h3 className="text-sm font-semibold text-foreground">Unassigned queue</h3>
            <span className="text-xs font-mono text-warning ml-auto">{unassignedGuests.length}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Filter unassigned..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs bg-muted border-border" />
          </div>
        </div>

        <div className="p-4 border-b border-border space-y-3">
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground">Suggested fits</h4>
          {selectedTableSummary ? (
            <>
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{selectedTableSummary.name}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{selectedTableSummary.zone} zone</p>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground">{selectedTableGuests.length}/{selectedTableSummary.capacity}</p>
                </div>
              </div>
              <div className="space-y-2">
                {quickSeatCandidates.map(({ guest, score }) => (
                  <button
                    key={guest.id}
                    onClick={() => moveGuestToTable(guest.id, selectedTableSummary.tableId, versionId)}
                    className="w-full text-left rounded-lg border border-border/70 bg-muted/20 p-3 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{guest.displayName}</p>
                        <p className="text-xs text-muted-foreground">{guest.organization || guest.notes || 'No notes'}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">fit {score}</Badge>
                    </div>
                  </button>
                ))}
                {quickSeatCandidates.length === 0 && (
                  <p className="text-xs text-muted-foreground">Pick a table to see suggested quick-seat options.</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Select a table to get suggested placements.</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {filteredUnassigned.map((guest) => (
            <div
              key={guest.id}
              draggable
              onDragStart={() => setDragGuest(guest.id)}
              className="flex items-start gap-2 py-2 px-2.5 rounded-md hover:bg-muted/50 cursor-grab transition-colors"
            >
              <MoveRight className="w-3 h-3 text-muted-foreground mt-1" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{guest.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{guest.organization}</p>
                {guest.relationshipTags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {guest.relationshipTags.slice(0, 3).map((t) => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/70 border border-primary/20">
                        {t}
                      </span>
                    ))}
                    {guest.relationshipTags.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{guest.relationshipTags.length - 3}</span>
                    )}
                  </div>
                )}
                {guest.accessibilityNeeds && <p className="text-xs text-info truncate">{guest.accessibilityNeeds}</p>}
                {guest.tablePreference && <p className="text-xs text-muted-foreground truncate">Prefers {guest.tablePreference}</p>}
              </div>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full shrink-0', categoryColors[guest.category])}>
                {guest.category.replace('_', ' ')}
              </span>
            </div>
          ))}
          {filteredUnassigned.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {unassignedGuests.length === 0 ? 'All confirmed guests assigned.' : 'No matches'}
            </p>
          )}
        </div>
      </div>

      <CreateSeatingRuleDialog open={showCreateRule} onOpenChange={setShowCreateRule} eventId={eventId!} />
    </div>
  );
}
