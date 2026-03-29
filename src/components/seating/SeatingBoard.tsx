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
import { TableHoverCard } from './TableHoverCard';

interface SeatingBoardProps {
  tables: LayoutObject[];
  assignments: SeatingAssignment[];
  guests: Guest[];
  relationshipGroups: RelationshipGroup[];
  relationshipMemberships: RelationshipMembership[];
  versionId: string;
  autoAssignedIds: Set<string>;
  highlightedTableId?: string | null;
  highlightedGuestId?: string | null;
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
  isHighlighted: boolean;
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
  isHighlighted,
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
          'relative w-[60px] h-[60px] rounded-full flex items-center justify-center transition-all duration-300 ease-in-out select-none',
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
          isHighlighted && 'ring-3 ring-emerald-400 ring-offset-2 ring-offset-background scale-110 shadow-[0_0_16px_rgba(52,211,153,0.4)]',
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
  highlightedGuestId?: string | null;
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
  highlightedGuestId,
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

  // Determine the dominant relationship group at this table (the "anchor")
  const seatedGuestIds = Array.from(seatMap.values()).map((g) => g.id);
  const groupCounts = new Map<string, number>();
  seatedGuestIds.forEach((gid) => {
    relationshipMemberships
      .filter((m) => m.guestId === gid)
      .forEach((m) => groupCounts.set(m.groupId, (groupCounts.get(m.groupId) ?? 0) + 1));
  });
  // Pick the group with the most members seated at this table
  let anchorGroup: RelationshipGroup | null = null;
  let anchorCount = 0;
  groupCounts.forEach((count, groupId) => {
    if (count > anchorCount) {
      anchorCount = count;
      const g = relationshipGroups.find((rg) => rg.id === groupId);
      if (g) { anchorGroup = g; anchorCount = count; }
    }
  });
  const anchorColor = anchorGroup
    ? (anchorGroup as RelationshipGroup).color ?? RELATIONSHIP_TYPE_COLORS[(anchorGroup as RelationshipGroup).type]
    : null;
  const isAnchored = anchorGroup !== null && anchorCount >= 1;

  return (
    <div className={cn(
      'rounded-xl border p-4 flex flex-col gap-3 group transition-all duration-300 ease-in-out',
      isAnchored ? 'border-opacity-60' : 'border-border bg-card',
    )} style={isAnchored && anchorColor ? {
      borderColor: `${anchorColor}50`,
      boxShadow: `0 0 20px ${anchorColor}12, 0 0 6px ${anchorColor}08`,
      background: `linear-gradient(135deg, ${anchorColor}06 0%, transparent 60%)`,
      backdropFilter: 'blur(8px)',
    } : undefined}>
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
          highlightedGuestId={highlightedGuestId}
          relationshipGroups={relationshipGroups}
          relationshipMemberships={relationshipMemberships}
          onDrop={onDropGuest}
          onUnseat={onUnseatGuest}
          anchorGroup={anchorGroup}
          anchorColor={anchorColor}
          isAnchored={isAnchored}
        />
      ) : (
        <RectTableSeats
          tableId={table.id}
          capacity={capacity}
          seatMap={seatMap}
          autoAssignedIds={autoAssignedIds}
          highlightedGuestId={highlightedGuestId}
          relationshipGroups={relationshipGroups}
          relationshipMemberships={relationshipMemberships}
          onDrop={onDropGuest}
          onUnseat={onUnseatGuest}
          anchorGroup={anchorGroup}
          anchorColor={anchorColor}
          isAnchored={isAnchored}
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
  highlightedGuestId?: string | null;
  relationshipGroups: RelationshipGroup[];
  relationshipMemberships: RelationshipMembership[];
  onDrop: (guestId: string, tableId: string, seatNumber: number) => void;
  onUnseat: (guestId: string) => void;
  anchorGroup: RelationshipGroup | null;
  anchorColor: string | null;
  isAnchored: boolean;
}

function RoundTableSeats({
  tableId,
  capacity,
  seatMap,
  autoAssignedIds,
  highlightedGuestId,
  relationshipGroups,
  relationshipMemberships,
  onDrop,
  onUnseat,
  anchorGroup,
  anchorColor,
  isAnchored,
}: SeatArrangementProps) {
  const positions = getCircularSeatPositions(capacity);
  const radius = Math.max(80, Math.min(130, 60 + capacity * 8));
  const containerSize = (radius + 40) * 2;
  const surfaceSize = radius * 2 * 0.55;

  return (
    <div
      className="relative mx-auto flex-shrink-0"
      style={{ width: containerSize, height: containerSize }}
    >
      {/* Table surface — glows when anchored */}
      <div
        className={cn(
          'absolute rounded-full border flex items-center justify-center transition-all duration-500',
          isAnchored
            ? 'border-2'
            : 'bg-muted/20 border-border/40',
        )}
        style={{
          width: surfaceSize,
          height: surfaceSize,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          ...(isAnchored && anchorColor
            ? {
                borderColor: anchorColor,
                background: `radial-gradient(circle, ${anchorColor}25 0%, ${anchorColor}08 70%, transparent 100%)`,
                boxShadow: `0 0 20px ${anchorColor}20, inset 0 0 15px ${anchorColor}10`,
              }
            : {}),
        }}
      >
        {isAnchored && anchorGroup && (
          <div className="text-center px-2 pointer-events-none select-none" style={{ maxWidth: surfaceSize - 16 }}>
            <p
              className="text-[9px] font-semibold leading-tight truncate"
              style={{ color: anchorColor ?? undefined }}
              title={(anchorGroup as RelationshipGroup).name}
            >
              {(anchorGroup as RelationshipGroup).name}
            </p>
            <p className="text-[8px] text-muted-foreground/60 uppercase tracking-wider mt-0.5">
              anchored
            </p>
          </div>
        )}
      </div>

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
              isHighlighted={!!guest && guest.id === highlightedGuestId}
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
  highlightedGuestId,
  relationshipGroups,
  relationshipMemberships,
  onDrop,
  onUnseat,
  anchorGroup,
  anchorColor,
  isAnchored,
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
            isHighlighted={!!guest && guest.id === highlightedGuestId}
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

      {/* Table surface — glows when anchored */}
      <div
        className={cn(
          'mx-4 h-10 rounded-md border flex items-center justify-center transition-all duration-500',
          isAnchored ? 'border-2' : 'bg-muted/20 border-border/40',
        )}
        style={isAnchored && anchorColor ? {
          borderColor: anchorColor,
          background: `linear-gradient(90deg, ${anchorColor}15 0%, ${anchorColor}25 50%, ${anchorColor}15 100%)`,
          boxShadow: `0 0 12px ${anchorColor}15`,
        } : undefined}
      >
        {isAnchored && anchorGroup ? (
          <span
            className="text-[10px] font-semibold truncate px-2"
            style={{ color: anchorColor ?? undefined }}
            title={(anchorGroup as RelationshipGroup).name}
          >
            {(anchorGroup as RelationshipGroup).name}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-wider">
            table
          </span>
        )}
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
  highlightedTableId,
  highlightedGuestId,
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
      {tables.map((table) => {
        const tableAssignments = assignments.filter((a) => a.tableId === table.id);
        const tableGuests = tableAssignments
          .map((a) => guests.find((g) => g.id === a.guestId))
          .filter(Boolean) as Guest[];
        const isHighlighted = highlightedTableId === table.id;

        return (
          <div
            key={table.id}
            data-table-id={table.id}
            className={cn(
              'rounded-xl transition-all duration-500',
              isHighlighted && 'ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-background shadow-[0_0_30px_rgba(52,211,153,0.2)]',
            )}
          >
            <TableHoverCard
              table={table}
              guests={tableGuests}
              relationshipGroups={relationshipGroups}
              relationshipMemberships={relationshipMemberships}
            >
              <TableCard
                table={table}
                assignments={assignments}
                guests={guests}
                relationshipGroups={relationshipGroups}
                relationshipMemberships={relationshipMemberships}
                autoAssignedIds={autoAssignedIds}
                highlightedGuestId={highlightedGuestId}
                onDropGuest={onDropGuest}
                onUnseatGuest={onUnseatGuest}
              />
            </TableHoverCard>
          </div>
        );
      })}
    </div>
  );
}
