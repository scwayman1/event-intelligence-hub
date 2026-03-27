import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useCallback, useMemo, useState } from 'react';
import {
  Accessibility,
  AlertTriangle,
  Circle,
  GripVertical,
  LayoutGrid,
  RectangleHorizontal,
  Search,
  Settings2,
  Sparkles,
  Users,
  Utensils,
  Wand2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { buildEventAnalytics } from '@/lib/event-analytics';
import { EmptyState } from '@/components/EmptyState';
import { EventNotFound } from '@/components/EventNotFound';
import type { Guest, GuestCategory } from '@/types/events';

const categoryColors: Record<GuestCategory, string> = {
  donor: 'bg-accent/20 text-accent',
  scholarship_recipient: 'bg-primary/20 text-primary',
  family: 'bg-muted text-muted-foreground',
  board_member: 'bg-info/20 text-info',
  vip: 'bg-warning/20 text-warning',
  staff: 'bg-muted text-muted-foreground',
  sponsor: 'bg-accent/15 text-accent',
  volunteer: 'bg-success/15 text-success',
  other: 'bg-muted text-muted-foreground',
};

const categoryDotColors: Record<string, string> = {
  donor: 'bg-accent',
  scholarship_recipient: 'bg-primary',
  family: 'bg-muted-foreground',
  board_member: 'bg-info',
  vip: 'bg-warning',
  staff: 'bg-muted-foreground',
  sponsor: 'bg-accent/60',
  volunteer: 'bg-success',
  other: 'bg-muted-foreground/50',
};

const categoryLabels: Record<string, string> = {
  donor: 'donor',
  scholarship_recipient: 'scholar',
  family: 'family',
  board_member: 'board',
  vip: 'VIP',
  staff: 'staff',
  sponsor: 'sponsor',
  volunteer: 'volunteer',
  other: 'other',
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

  const event = events.find((item) => item.id === eventId);
  if (!event) return <EventNotFound />;

  const analytics = buildEventAnalytics({ event, guests, versions, layoutObjects, seatingAssignments, seatingRules });
  const versionId = event.activeVersionId;
  const tables = analytics.tables;
  const assignments = analytics.assignments;
  const rules = analytics.rules;

  const assignedGuestIds = new Set(assignments.map((a) => a.guestId));
  const unassignedGuests = analytics.confirmedGuests.filter((g) => !assignedGuestIds.has(g.id));

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [dragGuestId, setDragGuestId] = useState<string | null>(null);
  const [dragOverTableId, setDragOverTableId] = useState<string | null>(null);

  const filteredUnassigned = unassignedGuests.filter((g) => {
    const matchesSearch = `${g.firstName} ${g.lastName} ${g.organization} ${g.notes}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || g.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getTableGuests = (tableId: string): Guest[] => {
    const guestIds = assignments.filter((a) => a.tableId === tableId).map((a) => a.guestId);
    return guests.filter((g) => guestIds.includes(g.id));
  };

  // Unique categories among unassigned for filter buttons
  const unassignedCategories = useMemo(() => {
    const cats = new Set(unassignedGuests.map((g) => g.category));
    return Array.from(cats).sort();
  }, [unassignedGuests]);

  const handleDragStart = useCallback((guestId: string) => {
    setDragGuestId(guestId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, tableId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTableId(tableId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverTableId(null);
  }, []);

  const handleDrop = useCallback(
    (tableId: string) => {
      if (dragGuestId) {
        moveGuestToTable(dragGuestId, tableId, versionId);
        setDragGuestId(null);
        setDragOverTableId(null);
      }
    },
    [dragGuestId, moveGuestToTable, versionId],
  );

  const handleDragEnd = useCallback(() => {
    setDragGuestId(null);
    setDragOverTableId(null);
  }, []);

  // Quick assign: round-robin unassigned confirmed guests across tables with capacity
  const handleQuickAssign = useCallback(() => {
    const currentAssignments = new Map<string, number>();
    tables.forEach((t) => {
      const count = assignments.filter((a) => a.tableId === t.id).length;
      currentAssignments.set(t.id, count);
    });

    const sortedTables = tables
      .filter((t) => (currentAssignments.get(t.id) ?? 0) < t.capacity)
      .sort((a, b) => {
        const availA = a.capacity - (currentAssignments.get(a.id) ?? 0);
        const availB = b.capacity - (currentAssignments.get(b.id) ?? 0);
        return availB - availA;
      });

    if (sortedTables.length === 0) return;

    let tableIndex = 0;
    for (const guest of unassignedGuests) {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < sortedTables.length) {
        const table = sortedTables[tableIndex % sortedTables.length];
        const current = currentAssignments.get(table.id) ?? 0;
        if (current < table.capacity) {
          moveGuestToTable(guest.id, table.id, versionId);
          currentAssignments.set(table.id, current + 1);
          placed = true;
        }
        tableIndex++;
        attempts++;
      }
      if (!placed) break;
    }
  }, [tables, assignments, unassignedGuests, moveGuestToTable, versionId]);

  // Stats
  const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
  const assignedCount = assignments.length;
  const unassignedCount = unassignedGuests.length;

  const tableTypeIcon = (type: string) => {
    if (type === 'round_table') return <Circle className="w-3.5 h-3.5 text-primary/60" />;
    return <RectangleHorizontal className="w-3.5 h-3.5 text-primary/60" />;
  };

  if (tables.length === 0 && assignments.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <EmptyState
          icon={LayoutGrid}
          title="No seating assignments yet"
          description="Add tables to your floor plan in the Layout Editor first, then come back here to assign guests to seats."
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col animate-fade-in">
      {/* Stats header */}
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary/80 mb-1">
              <Sparkles className="w-3.5 h-3.5" /> seating orchestration
            </div>
            <h1 className="text-2xl font-bold text-foreground">Seating Plan</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRules(!showRules)}
              className="gap-2"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Rules
            </Button>
            {unassignedCount > 0 && (
              <Button
                size="sm"
                onClick={handleQuickAssign}
                className="gap-2"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Quick Assign ({unassignedCount})
              </Button>
            )}
          </div>
        </div>

        {/* Stat pills */}
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <LayoutGrid className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tables</p>
              <p className="text-lg font-bold font-mono text-foreground leading-none">{tables.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <Utensils className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Capacity</p>
              <p className="text-lg font-bold font-mono text-foreground leading-none">{totalCapacity}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <Users className="w-4 h-4 text-success" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assigned</p>
              <p className="text-lg font-bold font-mono text-success leading-none">{assignedCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <Users className="w-4 h-4 text-warning" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Unassigned</p>
              <p className="text-lg font-bold font-mono text-warning leading-none">{unassignedCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Readiness</p>
              <p className="text-lg font-bold font-mono text-primary leading-none">{analytics.readinessScore}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Rules panel (collapsible) */}
      {showRules && (
        <div className="border-b border-border bg-card/30 px-6 py-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Seating Rules</h3>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-4">P{rule.priority}</span>
                  <div>
                    <p className="text-sm text-foreground">{rule.name}</p>
                    <p className="text-xs text-muted-foreground">{rule.description}</p>
                  </div>
                </div>
                <div className={cn('w-2 h-2 rounded-full', rule.enabled ? 'bg-success' : 'bg-muted-foreground/30')} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Table cards */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {tables.map((table) => {
              const tableGuests = getTableGuests(table.id);
              const overCapacity = tableGuests.length > table.capacity;
              const summary = analytics.tableSummaries.find((item) => item.tableId === table.id);
              const isDragOver = dragOverTableId === table.id;
              const hasSpace = tableGuests.length < table.capacity;
              const fillPercent = Math.min((tableGuests.length / table.capacity) * 100, 100);

              return (
                <div
                  key={table.id}
                  className={cn(
                    'glass-panel p-4 transition-all rounded-xl',
                    overCapacity && 'border-destructive/50',
                    dragGuestId && hasSpace && 'border-dashed border-primary/30',
                    isDragOver && 'ring-2 ring-primary border-primary/60 bg-primary/5 scale-[1.01]',
                  )}
                  onDragOver={(e) => handleDragOver(e, table.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => handleDrop(table.id)}
                >
                  {/* Table header */}
                  <div className="flex items-center justify-between mb-2 gap-3">
                    <div className="flex items-center gap-2">
                      {tableTypeIcon(table.type)}
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">{table.name}</h4>
                        {summary && (
                          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            {summary.zone} zone
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {overCapacity && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                      <span
                        className={cn(
                          'text-xs font-mono px-2 py-0.5 rounded-full',
                          overCapacity
                            ? 'bg-destructive/10 text-destructive'
                            : tableGuests.length === table.capacity
                              ? 'bg-success/10 text-success'
                              : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {tableGuests.length}/{table.capacity}
                      </span>
                    </div>
                  </div>

                  {/* Capacity bar */}
                  <div className="h-1.5 bg-muted rounded-full mb-3 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        overCapacity
                          ? 'bg-destructive'
                          : fillPercent >= 90
                            ? 'bg-success'
                            : fillPercent >= 50
                              ? 'bg-primary'
                              : 'bg-primary/60',
                      )}
                      style={{ width: `${fillPercent}%` }}
                    />
                  </div>

                  {/* Category mix dots */}
                  {summary && Object.keys(summary.categoryMix).length > 0 && (
                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                      {Object.entries(summary.categoryMix).map(([category, count]) => (
                        <div key={category} className="flex items-center gap-1">
                          <div className={cn('w-2 h-2 rounded-full', categoryDotColors[category] ?? 'bg-muted-foreground')} />
                          <span className="text-[10px] text-muted-foreground">
                            {categoryLabels[category] ?? category} {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Drop zone prompt during drag */}
                  {dragGuestId && hasSpace && (
                    <div
                      className={cn(
                        'mb-2 rounded-lg border-2 border-dashed py-2 text-center text-xs font-medium transition-colors',
                        isDragOver
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-muted-foreground/20 text-muted-foreground',
                      )}
                    >
                      Drop here to assign
                    </div>
                  )}

                  {/* Assigned guests */}
                  <div className="space-y-1">
                    {tableGuests.map((guest) => (
                      <div
                        key={guest.id}
                        draggable
                        onDragStart={() => handleDragStart(guest.id)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          'flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/30 hover:bg-muted/50 cursor-grab text-sm group transition-all',
                          dragGuestId === guest.id && 'opacity-40 scale-95',
                        )}
                      >
                        <GripVertical className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground" />
                        <span className="text-foreground flex-1 truncate">{guest.displayName}</span>
                        {guest.accessibilityNeeds && (
                          <Accessibility className="w-3 h-3 text-info shrink-0" />
                        )}
                        {guest.dietaryRestrictions && (
                          <Utensils className="w-3 h-3 text-muted-foreground shrink-0" />
                        )}
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full shrink-0', categoryColors[guest.category])}>
                          {categoryLabels[guest.category] ?? guest.category}
                        </span>
                      </div>
                    ))}
                    {tableGuests.length === 0 && !dragGuestId && (
                      <p className="text-xs text-muted-foreground text-center py-3 italic">No guests assigned</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel: Unassigned guests pool */}
        <div className="w-96 border-l border-border bg-card/50 flex flex-col shrink-0">
          {/* Pool header */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-warning" />
              <h3 className="text-sm font-semibold text-foreground">Unassigned Guests</h3>
              <Badge
                variant="outline"
                className={cn(
                  'ml-auto text-xs font-mono',
                  unassignedCount > 0
                    ? 'border-warning/50 bg-warning/10 text-warning'
                    : 'border-success/50 bg-success/10 text-success',
                )}
              >
                {unassignedCount}
              </Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-muted border-border"
              />
            </div>
            {/* Category filter chips */}
            {unassignedCategories.length > 1 && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setCategoryFilter(null)}
                  className={cn(
                    'text-[10px] px-2 py-1 rounded-full border transition-colors',
                    !categoryFilter
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  All
                </button>
                {unassignedCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                    className={cn(
                      'text-[10px] px-2 py-1 rounded-full border transition-colors',
                      categoryFilter === cat
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {categoryLabels[cat] ?? cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Guest list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {filteredUnassigned.map((guest) => (
              <div
                key={guest.id}
                draggable
                onDragStart={() => handleDragStart(guest.id)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'flex items-start gap-2 py-2 px-2.5 rounded-lg border border-transparent hover:bg-muted/50 hover:border-border cursor-grab transition-all group',
                  dragGuestId === guest.id && 'opacity-40 scale-95 border-primary/30',
                )}
              >
                <GripVertical className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{guest.displayName}</p>
                  {guest.organization && (
                    <p className="text-xs text-muted-foreground truncate">{guest.organization}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {guest.accessibilityNeeds && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-info">
                        <Accessibility className="w-3 h-3" />
                        {guest.accessibilityNeeds.length > 20
                          ? guest.accessibilityNeeds.slice(0, 20) + '...'
                          : guest.accessibilityNeeds}
                      </span>
                    )}
                    {guest.dietaryRestrictions && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Utensils className="w-3 h-3" />
                      </span>
                    )}
                    {guest.tablePreference && (
                      <span className="text-[10px] text-muted-foreground italic truncate">
                        Prefers {guest.tablePreference}
                      </span>
                    )}
                  </div>
                </div>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full shrink-0 mt-0.5', categoryColors[guest.category])}>
                  {categoryLabels[guest.category] ?? guest.category}
                </span>
              </div>
            ))}
            {filteredUnassigned.length === 0 && (
              <div className="text-center py-8">
                <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {unassignedGuests.length === 0
                    ? 'All confirmed guests are assigned!'
                    : 'No guests match your filters'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
