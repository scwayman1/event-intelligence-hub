import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useCallback, useMemo, useState } from 'react';
import {
  Accessibility,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
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
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

/* ------------------------------------------------------------------ */
/*  Stat pill sub-component                                           */
/* ------------------------------------------------------------------ */
function StatPill({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      {icon}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn('text-lg font-bold font-mono leading-none', valueClassName ?? 'text-foreground')}>
          {value}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export default function EventSeating() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const guests = useEventStore((s) => s.guests);
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);
  const moveGuestToTable = useEventStore((s) => s.moveGuestToTable);

  /* ----- local state (must be before any early return) ----- */
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [dragGuestId, setDragGuestId] = useState<string | null>(null);
  const [dragOverTableId, setDragOverTableId] = useState<string | null>(null);
  const [collapsedTables, setCollapsedTables] = useState<Set<string>>(new Set());

  const event = events.find((item) => item.id === eventId);

  const analytics = useMemo(
    () =>
      event
        ? buildEventAnalytics({ event, guests, versions, layoutObjects, seatingAssignments, seatingRules })
        : null,
    [event, guests, versions, layoutObjects, seatingAssignments, seatingRules],
  );
  const versionId = event?.activeVersionId ?? '';
  const tables = useMemo(() => analytics?.tables ?? [], [analytics]);
  const assignments = useMemo(() => analytics?.assignments ?? [], [analytics]);
  const rules = analytics?.rules ?? [];
  const confirmedGuests = analytics?.confirmedGuests ?? [];

  const assignedGuestIds = new Set(assignments.map((a) => a.guestId));
  const unassignedGuests = confirmedGuests.filter((g) => !assignedGuestIds.has(g.id));

  /* ----- derived ----- */
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

  const unassignedCategories = useMemo(() => {
    const cats = new Set(unassignedGuests.map((g) => g.category));
    return Array.from(cats).sort();
  }, [unassignedGuests]);

  /* ----- stats ----- */
  const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
  const assignedCount = assignments.length;
  const unassignedCount = unassignedGuests.length;
  const totalConfirmed = confirmedGuests.length;
  const assignmentPercent = totalConfirmed > 0 ? Math.round((assignedCount / totalConfirmed) * 100) : 0;

  /* ----- drag handlers ----- */
  const handleDragStart = useCallback((e: React.DragEvent, guestId: string) => {
    setDragGuestId(guestId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', guestId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, tableId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTableId(tableId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDragOverTableId(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, tableId: string) => {
      e.preventDefault();
      const guestId = e.dataTransfer.getData('text/plain') || dragGuestId;
      if (guestId) {
        moveGuestToTable(guestId, tableId, versionId);
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

  /* ----- remove guest from table ----- */
  const handleRemoveFromTable = useCallback(
    (guestId: string) => {
      const assignment = seatingAssignments.find(
        (a) => a.guestId === guestId && a.versionId === versionId,
      );
      if (assignment) {
        useEventStore.getState().removeSeatingAssignment(assignment.id);
      }
    },
    [seatingAssignments, versionId],
  );

  /* ----- collapse/expand table guest lists ----- */
  const toggleTableCollapse = useCallback((tableId: string) => {
    setCollapsedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) {
        next.delete(tableId);
      } else {
        next.add(tableId);
      }
      return next;
    });
  }, []);

  /* ----- quick assign: round-robin ----- */
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

  /* ----- helpers ----- */
  const tableTypeIcon = (type: string) => {
    if (type === 'round_table') return <Circle className="w-4 h-4 text-primary/70" />;
    return <RectangleHorizontal className="w-4 h-4 text-primary/70" />;
  };

  /* ----- early returns ----- */
  if (!event) return <EventNotFound />;

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

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col animate-fade-in">
        {/* ---- Stats header ---- */}
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
                {showRules ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
              {unassignedCount > 0 && (
                <Button size="sm" onClick={handleQuickAssign} className="gap-2">
                  <Wand2 className="w-3.5 h-3.5" />
                  Quick Assign ({unassignedCount})
                </Button>
              )}
            </div>
          </div>

          {/* Stat pills */}
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <StatPill
              icon={<LayoutGrid className="w-4 h-4 text-muted-foreground" />}
              label="Tables"
              value={tables.length}
            />
            <StatPill
              icon={<Utensils className="w-4 h-4 text-muted-foreground" />}
              label="Total Capacity"
              value={totalCapacity}
            />
            <StatPill
              icon={<Users className="w-4 h-4 text-success" />}
              label="Assigned"
              value={assignedCount}
              valueClassName="text-success"
            />
            <StatPill
              icon={<Users className="w-4 h-4 text-warning" />}
              label="Unassigned"
              value={unassignedCount}
              valueClassName={unassignedCount > 0 ? 'text-warning' : 'text-success'}
            />

            {/* Progress pill with mini bar */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Progress</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold font-mono text-primary leading-none">{assignmentPercent}%</p>
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${assignmentPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Rules panel (collapsible) ---- */}
        {showRules && (
          <div className="border-b border-border bg-card/30 px-6 py-4 animate-in slide-in-from-top-2 duration-200">
            <h3 className="text-sm font-semibold text-foreground mb-3">Seating Rules</h3>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground w-4">P{rule.priority}</span>
                    <div>
                      <p className="text-sm text-foreground">{rule.name}</p>
                      <p className="text-xs text-muted-foreground">{rule.description}</p>
                    </div>
                  </div>
                  <div
                    className={cn('w-2 h-2 rounded-full', rule.enabled ? 'bg-success' : 'bg-muted-foreground/30')}
                  />
                </div>
              ))}
              {rules.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full text-center py-4">
                  No seating rules configured
                </p>
              )}
            </div>
          </div>
        )}

        {/* ---- Main split layout ---- */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT PANEL: Table cards (scrollable) */}
          <ScrollArea className="flex-1">
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tables.map((table) => {
                  const tableGuests = getTableGuests(table.id);
                  const overCapacity = tableGuests.length > table.capacity;
                  const summary = analytics?.tableSummaries.find((item) => item.tableId === table.id);
                  const isDragOver = dragOverTableId === table.id;
                  const hasSpace = tableGuests.length < table.capacity;
                  const fillPercent = Math.min((tableGuests.length / table.capacity) * 100, 100);
                  const isCollapsed = collapsedTables.has(table.id);

                  return (
                    <div
                      key={table.id}
                      className={cn(
                        'glass-panel p-4 transition-all duration-200 rounded-xl',
                        overCapacity && 'border-destructive/50',
                        dragGuestId && hasSpace && 'border-dashed border-primary/30',
                        isDragOver &&
                          'ring-2 ring-primary border-primary/60 bg-primary/5 scale-[1.02] shadow-lg shadow-primary/10',
                        !isDragOver && !overCapacity && 'hover:border-border/80',
                      )}
                      onDragOver={(e) => (hasSpace ? handleDragOver(e, table.id) : undefined)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => (hasSpace ? handleDrop(e, table.id) : undefined)}
                    >
                      {/* Table header */}
                      <div className="flex items-center justify-between mb-2 gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            {tableTypeIcon(table.type)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-foreground truncate">{table.name}</h4>
                            {summary && (
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                {summary.zone} zone
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {overCapacity && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                              </TooltipTrigger>
                              <TooltipContent>Over capacity!</TooltipContent>
                            </Tooltip>
                          )}
                          <span
                            className={cn(
                              'text-xs font-mono px-2 py-0.5 rounded-full tabular-nums',
                              overCapacity
                                ? 'bg-destructive/10 text-destructive'
                                : tableGuests.length === table.capacity
                                  ? 'bg-success/10 text-success'
                                  : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {tableGuests.length}/{table.capacity}
                          </span>
                          <button
                            onClick={() => toggleTableCollapse(table.id)}
                            className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {isCollapsed ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronUp className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Capacity bar */}
                      <div className="h-1.5 bg-muted rounded-full mb-3 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500 ease-out',
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
                            <Tooltip key={category}>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 cursor-default">
                                  <div
                                    className={cn(
                                      'w-2 h-2 rounded-full',
                                      categoryDotColors[category] ?? 'bg-muted-foreground',
                                    )}
                                  />
                                  <span className="text-[10px] text-muted-foreground">
                                    {categoryLabels[category] ?? category} {count}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                {count} {categoryLabels[category] ?? category}
                                {count !== 1 ? 's' : ''} at this table
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      )}

                      {/* Drop zone prompt during drag */}
                      {dragGuestId && hasSpace && (
                        <div
                          className={cn(
                            'mb-2 rounded-lg border-2 border-dashed py-3 text-center text-xs font-medium transition-all duration-200',
                            isDragOver
                              ? 'border-primary bg-primary/10 text-primary scale-[1.02]'
                              : 'border-muted-foreground/20 text-muted-foreground',
                          )}
                        >
                          <ArrowRight
                            className={cn(
                              'w-4 h-4 mx-auto mb-1 transition-colors',
                              isDragOver ? 'text-primary' : 'text-muted-foreground/40',
                            )}
                          />
                          Drop here to assign
                        </div>
                      )}

                      {/* Full table indicator during drag */}
                      {dragGuestId && !hasSpace && (
                        <div className="mb-2 rounded-lg border-2 border-dashed border-destructive/20 py-2 text-center text-xs text-destructive/60">
                          Table full
                        </div>
                      )}

                      {/* Assigned guests (collapsible) */}
                      {!isCollapsed && (
                        <div className="space-y-1">
                          {tableGuests.map((guest) => (
                            <div
                              key={guest.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, guest.id)}
                              onDragEnd={handleDragEnd}
                              className={cn(
                                'flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/30 hover:bg-muted/50 cursor-grab text-sm group transition-all duration-150',
                                dragGuestId === guest.id && 'opacity-40 scale-95',
                              )}
                            >
                              <GripVertical className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
                              <span className="text-foreground flex-1 truncate">{guest.displayName}</span>
                              {guest.accessibilityNeeds && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Accessibility className="w-3 h-3 text-info shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>{guest.accessibilityNeeds}</TooltipContent>
                                </Tooltip>
                              )}
                              {guest.dietaryRestrictions && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Utensils className="w-3 h-3 text-muted-foreground shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>{guest.dietaryRestrictions}</TooltipContent>
                                </Tooltip>
                              )}
                              <span
                                className={cn(
                                  'text-[10px] px-1.5 py-0.5 rounded-full shrink-0',
                                  categoryColors[guest.category],
                                )}
                              >
                                {categoryLabels[guest.category] ?? guest.category}
                              </span>
                              <button
                                onClick={() => handleRemoveFromTable(guest.id)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
                                title="Remove from table"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          {tableGuests.length === 0 && !dragGuestId && (
                            <p className="text-xs text-muted-foreground text-center py-4 italic">
                              No guests assigned -- drag guests here
                            </p>
                          )}
                        </div>
                      )}

                      {/* Collapsed summary: avatar stack */}
                      {isCollapsed && tableGuests.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <div className="flex -space-x-1">
                            {tableGuests.slice(0, 5).map((g) => (
                              <div
                                key={g.id}
                                className="w-5 h-5 rounded-full bg-muted border border-background flex items-center justify-center text-[8px] font-medium text-muted-foreground"
                                title={g.displayName}
                              >
                                {g.firstName[0]}
                              </div>
                            ))}
                          </div>
                          {tableGuests.length > 5 && (
                            <span className="text-[10px] text-muted-foreground ml-1">
                              +{tableGuests.length - 5} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {tables.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <LayoutGrid className="w-12 h-12 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">No tables configured</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Add tables in the Layout tab to begin seating
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* RIGHT PANEL: Unassigned guests pool */}
          <div className="w-96 border-l border-border bg-card/50 flex flex-col shrink-0">
            {/* Pool header */}
            <div className="p-4 border-b border-border space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-warning" />
                <h3 className="text-sm font-semibold text-foreground">Unassigned Guests</h3>
                <Badge
                  variant="outline"
                  className={cn(
                    'ml-auto text-xs font-mono tabular-nums',
                    unassignedCount > 0
                      ? 'border-warning/50 bg-warning/10 text-warning'
                      : 'border-success/50 bg-success/10 text-success',
                  )}
                >
                  {unassignedCount === 0 ? (
                    <span className="flex items-center gap-1">
                      <Check className="w-3 h-3" /> 0
                    </span>
                  ) : (
                    unassignedCount
                  )}
                </Badge>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name or org..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-muted border-border"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
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
                        'text-[10px] px-2 py-1 rounded-full border transition-colors flex items-center gap-1',
                        categoryFilter === cat
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <div
                        className={cn('w-1.5 h-1.5 rounded-full', categoryDotColors[cat] ?? 'bg-muted-foreground')}
                      />
                      {categoryLabels[cat] ?? cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Filtered count indicator */}
              {(search || categoryFilter) && filteredUnassigned.length !== unassignedCount && (
                <p className="text-[10px] text-muted-foreground">
                  Showing {filteredUnassigned.length} of {unassignedCount} unassigned guests
                </p>
              )}
            </div>

            {/* Guest list */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1">
                {filteredUnassigned.map((guest) => (
                  <div
                    key={guest.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, guest.id)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      'flex items-start gap-2 py-2 px-2.5 rounded-lg border border-transparent hover:bg-muted/50 hover:border-border cursor-grab transition-all duration-150 group',
                      dragGuestId === guest.id && 'opacity-40 scale-95 border-primary/30',
                    )}
                  >
                    <GripVertical className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground mt-1 shrink-0 transition-colors" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{guest.displayName}</p>
                      {guest.organization && (
                        <p className="text-xs text-muted-foreground truncate">{guest.organization}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {guest.accessibilityNeeds && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-info cursor-default">
                                <Accessibility className="w-3 h-3" />
                                {guest.accessibilityNeeds.length > 20
                                  ? guest.accessibilityNeeds.slice(0, 20) + '...'
                                  : guest.accessibilityNeeds}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{guest.accessibilityNeeds}</TooltipContent>
                          </Tooltip>
                        )}
                        {guest.dietaryRestrictions && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground cursor-default">
                                <Utensils className="w-3 h-3" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{guest.dietaryRestrictions}</TooltipContent>
                          </Tooltip>
                        )}
                        {guest.tablePreference && (
                          <span className="text-[10px] text-muted-foreground italic truncate">
                            Prefers {guest.tablePreference}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full shrink-0 mt-0.5',
                        categoryColors[guest.category],
                      )}
                    >
                      {categoryLabels[guest.category] ?? guest.category}
                    </span>
                  </div>
                ))}
                {filteredUnassigned.length === 0 && (
                  <div className="text-center py-8">
                    {unassignedGuests.length === 0 ? (
                      <>
                        <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
                          <Check className="w-6 h-6 text-success" />
                        </div>
                        <p className="text-sm font-medium text-foreground mb-1">All seated!</p>
                        <p className="text-xs text-muted-foreground">
                          Every confirmed guest has been assigned a table.
                        </p>
                      </>
                    ) : (
                      <>
                        <Search className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No guests match your filters</p>
                        <button
                          onClick={() => {
                            setSearch('');
                            setCategoryFilter(null);
                          }}
                          className="text-xs text-primary hover:underline mt-1"
                        >
                          Clear filters
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
