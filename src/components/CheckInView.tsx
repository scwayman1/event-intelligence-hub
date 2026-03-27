import { useMemo, useState } from 'react';
import { useEventStore } from '@/data/store';
import { buildEventAnalytics } from '@/lib/event-analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  Clock,
  Search,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { Guest, GuestCategory } from '@/types/events';

const categoryLabels: Record<GuestCategory, string> = {
  donor: 'Donor',
  scholarship_recipient: 'Scholar',
  family: 'Family',
  board_member: 'Board',
  vip: 'VIP',
  staff: 'Staff',
  sponsor: 'Sponsor',
  volunteer: 'Volunteer',
  other: 'Other',
};

const categoryColors: Record<GuestCategory, string> = {
  donor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  scholarship_recipient: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  family: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  board_member: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  vip: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  staff: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  sponsor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  volunteer: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  other: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

interface CheckInViewProps {
  eventId: string;
  onClose: () => void;
}

export default function CheckInView({ eventId, onClose }: CheckInViewProps) {
  const events = useEventStore((s) => s.events);
  const guests = useEventStore((s) => s.guests);
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);
  const updateGuest = useEventStore((s) => s.updateGuest);

  const event = events.find((e) => e.id === eventId);

  const analytics = event
    ? buildEventAnalytics({ event, guests, versions, layoutObjects, seatingAssignments, seatingRules })
    : null;

  const [search, setSearch] = useState('');
  const [recentCheckIns, setRecentCheckIns] = useState<
    { id: string; name: string; time: string }[]
  >([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const eventGuests = useMemo(() => {
    return guests.filter((g) => g.eventId === eventId);
  }, [guests, eventId]);

  const matchingGuests = useMemo(() => {
    if (search.trim() === '') return [];
    const q = search.toLowerCase();
    return eventGuests
      .filter(
        (g) =>
          `${g.firstName} ${g.lastName} ${g.organization} ${g.email}`
            .toLowerCase()
            .includes(q),
      )
      .slice(0, 12);
  }, [eventGuests, search]);

  const checkedInCount = eventGuests.filter(
    (g) => g.rsvpStatus === 'checked_in',
  ).length;
  const confirmedCount = eventGuests.filter(
    (g) => g.rsvpStatus === 'confirmed',
  ).length;
  const totalExpected = checkedInCount + confirmedCount;
  const progressPct = totalExpected > 0 ? Math.round((checkedInCount / totalExpected) * 100) : 0;

  const tableMap = useMemo(() => {
    if (!analytics) return new Map<string, { name: string; type: string }>();
    const result = new Map<string, { name: string; type: string }>();
    analytics.assignments.forEach((assignment) => {
      const table = analytics.tables.find((t) => t.id === assignment.tableId);
      if (table) {
        const typeLabel = table.type === 'round_table' ? 'Round Table' : table.type === 'rect_table' ? 'Rectangular' : table.type;
        result.set(assignment.guestId, { name: table.name, type: typeLabel });
      }
    });
    return result;
  }, [analytics]);

  const handleCheckIn = (guest: Guest) => {
    updateGuest(guest.id, { rsvpStatus: 'checked_in' });
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    setRecentCheckIns((prev) =>
      [{ id: guest.id, name: guest.displayName, time: timeStr }, ...prev].slice(
        0,
        5,
      ),
    );
  };

  const handleBulkCheckIn = () => {
    const confirmedGuests = eventGuests.filter(
      (g) => g.rsvpStatus === 'confirmed',
    );
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const newRecent: { id: string; name: string; time: string }[] = [];
    confirmedGuests.forEach((g) => {
      updateGuest(g.id, { rsvpStatus: 'checked_in' });
      newRecent.push({ id: g.id, name: g.displayName, time: timeStr });
    });
    setRecentCheckIns((prev) =>
      [...newRecent, ...prev].slice(0, 5),
    );
    setBulkConfirmOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <Zap className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  Event Day Check-In
                </h1>
                <p className="text-sm text-slate-400">
                  {event?.name} — {event?.venue}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-300">
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  {checkedInCount}
                </span>
                <span className="text-slate-500 mx-1">/</span>
                <span className="text-lg font-mono text-slate-300">
                  {totalExpected}
                </span>
                <span className="text-slate-500 ml-2 text-xs">checked in</span>
              </span>
            </div>
            <div className="flex-1 max-w-md">
              <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-mono text-emerald-400 font-bold">
              {progressPct}%
            </span>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <Input
              autoFocus
              placeholder="Type a guest name to find them..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 h-14 text-lg bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20"
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          {/* Left: search results */}
          <div>
            {search.trim() === '' ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Search className="w-12 h-12 mb-4 opacity-40" />
                <p className="text-lg">Start typing to search for a guest</p>
                <p className="text-sm mt-1">
                  Search by name, organization, or email
                </p>
              </div>
            ) : matchingGuests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Users className="w-12 h-12 mb-4 opacity-40" />
                <p className="text-lg">No guests found for "{search}"</p>
                <Button
                  variant="outline"
                  className="mt-4 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                  onClick={() => setSearch('')}
                >
                  Clear search
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {matchingGuests.map((guest) => {
                  const isCheckedIn = guest.rsvpStatus === 'checked_in';
                  const tableInfo = tableMap.get(guest.id);

                  return (
                    <div
                      key={guest.id}
                      className={`rounded-xl border p-5 transition-all ${
                        isCheckedIn
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-lg font-semibold text-white">
                            {guest.displayName}
                          </p>
                          {guest.organization && (
                            <p className="text-sm text-slate-400 mt-0.5">
                              {guest.organization}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-xs shrink-0 ${categoryColors[guest.category]}`}
                        >
                          {categoryLabels[guest.category]}
                        </Badge>
                      </div>

                      {tableInfo && (
                        <p className="text-sm text-slate-300 mb-2">
                          <span className="text-slate-500">Table:</span>{' '}
                          {tableInfo.name}{' '}
                          <span className="text-slate-600">—</span>{' '}
                          <span className="text-slate-400">
                            {tableInfo.type}
                          </span>
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
                            isCheckedIn
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : guest.rsvpStatus === 'confirmed'
                                ? 'bg-green-500/15 text-green-400'
                                : guest.rsvpStatus === 'invited'
                                  ? 'bg-blue-500/15 text-blue-400'
                                  : guest.rsvpStatus === 'declined'
                                    ? 'bg-red-500/15 text-red-400'
                                    : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isCheckedIn
                                ? 'bg-emerald-400'
                                : guest.rsvpStatus === 'confirmed'
                                  ? 'bg-green-400'
                                  : guest.rsvpStatus === 'invited'
                                    ? 'bg-blue-400'
                                    : guest.rsvpStatus === 'declined'
                                      ? 'bg-red-400'
                                      : 'bg-amber-400'
                            }`}
                          />
                          {guest.rsvpStatus.replace('_', ' ')}
                        </span>

                        {isCheckedIn ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold text-sm">
                            <CheckCircle2 className="w-5 h-5" />
                            Checked In
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 h-10 text-sm"
                            onClick={() => handleCheckIn(guest)}
                          >
                            CHECK IN
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* Recent check-ins */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" />
                Recent Check-ins
              </h3>
              {recentCheckIns.length === 0 ? (
                <p className="text-sm text-slate-600 py-4 text-center">
                  No check-ins yet
                </p>
              ) : (
                <div className="space-y-2">
                  {recentCheckIns.map((entry, i) => (
                    <div
                      key={`${entry.id}-${i}`}
                      className="flex items-center justify-between gap-2 py-2 border-b border-slate-800 last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="text-sm text-slate-300 truncate">
                          {entry.name}
                        </span>
                      </div>
                      <span className="text-xs text-slate-600 shrink-0">
                        {entry.time}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bulk check-in */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Quick Actions
              </h3>
              {!bulkConfirmOpen ? (
                <Button
                  variant="outline"
                  className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                  onClick={() => setBulkConfirmOpen(true)}
                  disabled={confirmedCount === 0}
                >
                  Check in all confirmed ({confirmedCount})
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-amber-400">
                    This will check in {confirmedCount} confirmed guest
                    {confirmedCount !== 1 ? 's' : ''}. Continue?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                      onClick={handleBulkCheckIn}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                      onClick={() => setBulkConfirmOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Live summary */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">
                Live Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total guests</span>
                  <span className="font-mono text-slate-300">
                    {eventGuests.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Checked in</span>
                  <span className="font-mono text-emerald-400">
                    {checkedInCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Remaining confirmed</span>
                  <span className="font-mono text-slate-300">
                    {confirmedCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Invited (no RSVP)</span>
                  <span className="font-mono text-slate-400">
                    {eventGuests.filter((g) => g.rsvpStatus === 'invited').length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
