import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Guest,
  LayoutObject,
  RelationshipGroup,
  RelationshipMembership,
  SeatingAssignment,
} from '@/types/events';
import { RELATIONSHIP_TYPE_COLORS } from '@/types/events';

interface SeatingBoardProps {
  tables: LayoutObject[];
  assignments: SeatingAssignment[];
  guests: Guest[];
  relationshipGroups: RelationshipGroup[];
  relationshipMemberships: RelationshipMembership[];
  versionId: string;
  autoAssignedIds: Set<string>;
  onDropGuest: (guestId: string, tableId: string, seatNumber: number) => void;
  onUnseatGuest: (guestId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(guest: Guest): string {
  const first = guest.firstName?.[0] ?? '';
  const last = guest.lastName?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
}

/** Positions for seats around a round table, returned as percentage offsets from the card center */
function getCircularSeatPositions(count: number): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return {
      x: Math.cos(angle),
      y: Math.sin(angle),
    };
  });
}

/** Positions for seats along the top and bottom of a rect table */
function getRectSeatPositions(count: number): Array<{ row: 'top' | 'bottom'; index: number; total: number }> {
  const perSide = Math.ceil(count / 2);
  const positions: Array<{ row: 'top' | 'bottom'; index: number; total: number }> = [];
  for (let i = 0; i < perSide && positions.length < count; i++) {
    positions.push({ row: 'top', index: i, total: perSide });
  }
  for (let i = 0; i < perSide && positions.length < count; i++) {
    positions.push({ row: 'bottom', index: i, total: perSide });
  }
  return positions;
}

// ─── SeatSlot ────────────────────────────────────────────────────────────────

interface SeatSlotProps {
  seatNumber: number;
  tableId: string;
  guest: Guest | undefined;
  isAutoAssigned: boolean;
  relationshipGroups: RelationshipGroup[];
  relationshipMemberships: RelationshipMembership[];
  onDrop: (guestId: string, tableId: string, seatNumber: number) => void;
  onUnseat: (guestId: string) => void;
}

function SeatSlot({
  seatNumber,
  tableId,
  guest,
  isAutoAssigned,
  relationshipGroups,
  relationshipMemberships,
  onDrop,
  onUnseat,
}: SeatSlotProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  // Determine relationship color for this guest
  const groupColor = (() => {
    if (!guest) return null;
    const membership = relationshipMemberships.find((m) => m.guestId === guest.id);
    if (!membership) return null;
    const group = relationshipGroups.find((g) => g.id === membership.groupId);
    if (!group) return null;
    return group.color ?? RELATIONSHIP_TYPE_COLORS[group.type];
  })();

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (guest) return; // occupied seats don't accept drops
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (guest) return;
    const guestId = e.dataTransfer.getData('guestId');
    if (guestId) {
      onDrop(guestId, tableId, seatNumber);
    }
  };

  const tooltipLabel = guest
    ? `${guest.displayName}${guest.organization ? ` · ${guest.organization}` : ''}`
    : `Seat ${seatNumber}`;

  return (
    <div className="flex flex-col items-center gap-0.5">
      {/* Seat circle */}
      <div
        title={tooltipLabel}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative w-[60px] h-[60px] rounded-full flex items-center justify-center transition-all select-none',
          guest
            ? 'border-2'
            : cn(
                'border-2 border-dashed',
                isDragOver
                  ? 'border-primary bg-primary/10 scale-105'
                  : 'border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/30',
              ),
          isAutoAssigned && !guest && 'border-green-500 animate-pulse',
          isAutoAssigned && guest && 'border-green-500 animate-pulse',
        )}
        style={
          guest && groupColor
            ? { borderColor: groupColor, background: `${groupColor}18` }
            : undefined
        }
      >
        {guest ? (
          <>
            {/* Initials */}
            <span
              className="text-[13px] font-bold leading-none"
              style={{ color: groupColor ?? undefined }}
            >
              {getInitials(guest)}
            </span>

            {/* Unseat button */}
            <button
              onClick={() => onUnseat(guest.id)}
              title={`Remove ${guest.displayName}`}
              className={cn(
                'absolute -top-1 -right-1 w-4 h-4 rounded-full',
                'bg-destructive text-destructive-foreground',
                'flex items-center justify-center opacity-0 hover:opacity-100',
                'transition-opacity group-hover:opacity-100 focus:opacity-100',
              )}
              style={{ fontSize: 9 }}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </>
        ) : (
          <Plus
            className={cn(
              'w-4 h-4 transition-colors',
              isDragOver ? 'text-primary' : 'text-muted-foreground/40',
            )}
          />
        )}
      </div>

      {/* Seat number label */}
      <span className="text-[9px] font-mono text-muted-foreground/50 leading-none">{seatNumber}</span>
    </div>
  );
}

// ─── TableCard ───────────────────────────────────────────────────────────────

interface TableCardProps {
  table: LayoutObject;
  assignments: SeatingAssignment[];
  guests: Guest[];
  relationshipGroups: RelationshipGroup[];
  relationshipMemberships: RelationshipMembership[];
  autoAssignedIds: Set<string>;
  onDropGuest: (guestId: string, tableId: string, seatNumber: number) => void;
  onUnseatGuest: (guestId: string) => void;
}

function TableCard({
  table,
  assignments,
  guests,
  relationshipGroups,
  relationshipMemberships,
  autoAssignedIds,
  onDropGuest,
  onUnseatGuest,
}: TableCardProps) {
  const capacity = Math.max(table.capacity, 1);
  const tableAssignments = assignments.filter((a) => a.tableId === table.id);

  // Build a seat-number → guest map, filling in from assignments
  const seatMap = new Map<number, Guest>();
  tableAssignments.forEach((a) => {
    const guest = guests.find((g) => g.id === a.guestId);
    if (!guest) return;
    // If a specific seat number is stored use it, otherwise assign to any open slot
    const seat = a.seatNumber ?? 0;
    if (seat >= 1 && seat <= capacity) {
      seatMap.set(seat, guest);
    }
  });

  // For assignments without a fixed seat number, allocate to first open seat
  tableAssignments.forEach((a) => {
    const guest = guests.find((g) => g.id === a.guestId);
    if (!guest) return;
    const alreadyPlaced = Array.from(seatMap.values()).some((g) => g.id === guest.id);
    if (alreadyPlaced) return;
    for (let s = 1; s <= capacity; s++) {
      if (!seatMap.has(s)) {
        seatMap.set(s, guest);
        break;
      }
    }
  });

  const assignedCount = tableAssignments.length;
  const utilizationLabel = `${assignedCount}/${capacity}`;
  const utilizationPct = capacity > 0 ? (assignedCount / capacity) * 100 : 0;
  const isOverCapacity = assignedCount > capacity;

  const isRound = table.type === 'round_table';

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 group">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground truncate">{table.name}</h3>
        <span
          className={cn(
            'text-[11px] font-mono px-2 py-0.5 rounded-full border',
            isOverCapacity
              ? 'bg-destructive/15 text-destructive border-destructive/30'
              : utilizationPct >= 90
              ? 'bg-warning/15 text-warning border-warning/30'
              : 'bg-muted text-muted-foreground border-border',
          )}
        >
          {utilizationLabel}
        </span>
      </div>

      {/* Seat arrangement */}
      {isRound ? (
        <RoundTableSeats
          tableId={table.id}
          capacity={capacity}
          seatMap={seatMap}
          autoAssignedIds={autoAssignedIds}
          relationshipGroups={relationshipGroups}
          relationshipMemberships={relationshipMemberships}
          onDrop={onDropGuest}
          onUnseat={onUnseatGuest}
        />
      ) : (
        <RectTableSeats
          tableId={table.id}
          capacity={capacity}
          seatMap={seatMap}
          autoAssignedIds={autoAssignedIds}
          relationshipGroups={relationshipGroups}
          relationshipMemberships={relationshipMemberships}
          onDrop={onDropGuest}
          onUnseat={onUnseatGuest}
        />
      )}
    </div>
  );
}

// ─── RoundTableSeats ─────────────────────────────────────────────────────────

interface SeatArrangementProps {
  tableId: string;
  capacity: number;
  seatMap: Map<number, Guest>;
  autoAssignedIds: Set<string>;
  relationshipGroups: RelationshipGroup[];
  relationshipMemberships: RelationshipMembership[];
  onDrop: (guestId: string, tableId: string, seatNumber: number) => void;
  onUnseat: (guestId: string) => void;
}

function RoundTableSeats({
  tableId,
  capacity,
  seatMap,
  autoAssignedIds,
  relationshipGroups,
  relationshipMemberships,
  onDrop,
  onUnseat,
}: SeatArrangementProps) {
  const positions = getCircularSeatPositions(capacity);
  // The oval container: seats radiate from center; use a fixed radius in px
  const radius = Math.max(80, Math.min(130, 60 + capacity * 8));
  const containerSize = (radius + 40) * 2; // diameter + seat size

  return (
    <div
      className="relative mx-auto flex-shrink-0"
      style={{ width: containerSize, height: containerSize }}
    >
      {/* Table surface */}
      <div
        className="absolute rounded-full bg-muted/20 border border-border/40"
        style={{
          width: radius * 2 * 0.55,
          height: radius * 2 * 0.55,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Seats */}
      {positions.map((pos, i) => {
        const seatNumber = i + 1;
        const guest = seatMap.get(seatNumber);
        const isAutoAssigned = guest ? autoAssignedIds.has(guest.id) : false;
        const cx = containerSize / 2 + pos.x * radius;
        const cy = containerSize / 2 + pos.y * radius;

        return (
          <div
            key={seatNumber}
            className="absolute"
            style={{
              left: cx - 30, // 30 = half of 60px seat
              top: cy - 30,
            }}
          >
            <SeatSlot
              seatNumber={seatNumber}
              tableId={tableId}
              guest={guest}
              isAutoAssigned={isAutoAssigned}
              relationshipGroups={relationshipGroups}
              relationshipMemberships={relationshipMemberships}
              onDrop={onDrop}
              onUnseat={onUnseat}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── RectTableSeats ──────────────────────────────────────────────────────────

function RectTableSeats({
  tableId,
  capacity,
  seatMap,
  autoAssignedIds,
  relationshipGroups,
  relationshipMemberships,
  onDrop,
  onUnseat,
}: SeatArrangementProps) {
  const positions = getRectSeatPositions(capacity);
  const topSeats = positions.filter((p) => p.row === 'top');
  const bottomSeats = positions.filter((p) => p.row === 'bottom');

  const renderRow = (rowSeats: typeof topSeats, startIndex: number) => (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {rowSeats.map((pos, i) => {
        const seatNumber = startIndex + i + 1;
        const guest = seatMap.get(seatNumber);
        const isAutoAssigned = guest ? autoAssignedIds.has(guest.id) : false;
        return (
          <SeatSlot
            key={seatNumber}
            seatNumber={seatNumber}
            tableId={tableId}
            guest={guest}
            isAutoAssigned={isAutoAssigned}
            relationshipGroups={relationshipGroups}
            relationshipMemberships={relationshipMemberships}
            onDrop={onDrop}
            onUnseat={onUnseat}
          />
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Top row */}
      {renderRow(topSeats, 0)}

      {/* Table surface */}
      <div className="mx-4 h-8 rounded-md bg-muted/20 border border-border/40 flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-wider">
          table
        </span>
      </div>

      {/* Bottom row */}
      {renderRow(bottomSeats, topSeats.length)}
    </div>
  );
}

// ─── SeatingBoard ─────────────────────────────────────────────────────────────

export function SeatingBoard({
  tables,
  assignments,
  guests,
  relationshipGroups,
  relationshipMemberships,
  autoAssignedIds,
  onDropGuest,
  onUnseatGuest,
}: SeatingBoardProps) {
  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
        <p className="text-muted-foreground text-sm">No tables in this layout.</p>
        <p className="text-muted-foreground/60 text-xs">Add round or rect tables in the layout editor to see them here.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
      {tables.map((table) => (
        <TableCard
          key={table.id}
          table={table}
          assignments={assignments}
          guests={guests}
          relationshipGroups={relationshipGroups}
          relationshipMemberships={relationshipMemberships}
          autoAssignedIds={autoAssignedIds}
          onDropGuest={onDropGuest}
          onUnseatGuest={onUnseatGuest}
        />
      ))}
    </div>
  );
}
