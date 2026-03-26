import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, AlertTriangle, Users, Settings2, ArrowUpDown, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);
  const moveGuestToTable = useEventStore((s) => s.moveGuestToTable);

  const event = events.find((e) => e.id === eventId);
  const versionId = event?.activeVersionId || '';
  const eventGuests = guests.filter((g) => g.eventId === eventId);
  const objects = layoutObjects.filter((o) => o.versionId === versionId);
  const tables = objects.filter((o) => ['round_table', 'rect_table'].includes(o.type));
  const assignments = seatingAssignments.filter((a) => a.versionId === versionId);
  const rules = seatingRules.filter((r) => r.eventId === eventId);

  const assignedGuestIds = new Set(assignments.map((a) => a.guestId));
  const unassignedGuests = eventGuests.filter((g) => !assignedGuestIds.has(g.id) && g.rsvpStatus === 'confirmed');

  const [search, setSearch] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [dragGuest, setDragGuest] = useState<string | null>(null);

  const filteredUnassigned = unassignedGuests.filter((g) =>
    `${g.firstName} ${g.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  const getTableGuests = (tableId: string): Guest[] => {
    const guestIds = assignments.filter((a) => a.tableId === tableId).map((a) => a.guestId);
    return guests.filter((g) => guestIds.includes(g.id));
  };

  const handleDrop = (tableId: string) => {
    if (dragGuest) {
      moveGuestToTable(dragGuest, tableId, versionId);
      setDragGuest(null);
    }
  };

  if (!event) return <div className="p-8 text-muted-foreground">Event not found</div>;

  return (
    <div className="flex h-screen">
      {/* Main seating area */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Seating Plan</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tables.length} tables · {assignments.length} assigned · <span className="text-warning">{unassignedGuests.length} unassigned</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowRules(!showRules)} className="gap-2">
            <Settings2 className="w-3.5 h-3.5" />
            Rules
          </Button>
        </div>

        {/* Rules panel */}
        {showRules && (
          <div className="glass-panel p-4 mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Seating Rules</h3>
            <div className="space-y-2">
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

        {/* Tables grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tables.map((table) => {
            const tableGuests = getTableGuests(table.id);
            const overCapacity = tableGuests.length > table.capacity;

            return (
              <div
                key={table.id}
                className={cn(
                  'glass-panel p-4 transition-all',
                  overCapacity && 'border-destructive/50',
                  dragGuest && 'border-dashed border-primary/30 hover:border-primary/60'
                )}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => handleDrop(table.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-foreground">{table.name}</h4>
                  <div className="flex items-center gap-2">
                    {overCapacity && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                    <span className={cn('text-xs font-mono', overCapacity ? 'text-destructive' : 'text-muted-foreground')}>
                      {tableGuests.length}/{table.capacity}
                    </span>
                  </div>
                </div>

                {/* Capacity bar */}
                <div className="h-1 bg-muted rounded-full mb-3 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', overCapacity ? 'bg-destructive' : 'bg-primary')}
                    style={{ width: `${Math.min((tableGuests.length / table.capacity) * 100, 100)}%` }}
                  />
                </div>

                <div className="space-y-1">
                  {tableGuests.map((guest) => (
                    <div
                      key={guest.id}
                      draggable
                      onDragStart={() => setDragGuest(guest.id)}
                      className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/30 hover:bg-muted/50 cursor-grab text-sm"
                    >
                      <GripVertical className="w-3 h-3 text-muted-foreground" />
                      <span className="text-foreground flex-1 truncate">{guest.displayName}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', categoryColors[guest.category])}>
                        {guest.category.replace('_', ' ')}
                      </span>
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

      {/* Unassigned queue */}
      <div className="w-72 border-l border-border bg-card/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-warning" />
            <h3 className="text-sm font-semibold text-foreground">Unassigned</h3>
            <span className="text-xs font-mono text-warning ml-auto">{unassignedGuests.length}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Filter..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs bg-muted border-border" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {filteredUnassigned.map((guest) => (
            <div
              key={guest.id}
              draggable
              onDragStart={() => setDragGuest(guest.id)}
              className="flex items-center gap-2 py-2 px-2.5 rounded-md hover:bg-muted/50 cursor-grab transition-colors"
            >
              <GripVertical className="w-3 h-3 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{guest.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{guest.organization}</p>
              </div>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full shrink-0', categoryColors[guest.category])}>
                {guest.category.replace('_', ' ')}
              </span>
            </div>
          ))}
          {filteredUnassigned.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {unassignedGuests.length === 0 ? 'All confirmed guests assigned!' : 'No matches'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
