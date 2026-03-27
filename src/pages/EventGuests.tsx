import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useMemo, useState } from 'react';
import { AlertTriangle, Mail, Phone, Search, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { buildEventAnalytics } from '@/lib/event-analytics';
import type { GuestCategory, RSVPStatus } from '@/types/events';

const categoryLabels: Record<GuestCategory, string> = {
  donor: 'Donor', scholarship_recipient: 'Scholar', family: 'Family',
  board_member: 'Board', vip: 'VIP', staff: 'Staff', sponsor: 'Sponsor',
  volunteer: 'Volunteer', other: 'Other',
};

const categoryColors: Record<GuestCategory, string> = {
  donor: 'bg-accent/20 text-accent border-accent/30',
  scholarship_recipient: 'bg-primary/20 text-primary border-primary/30',
  family: 'bg-muted text-muted-foreground border-border',
  board_member: 'bg-info/20 text-info border-info/30',
  vip: 'bg-warning/20 text-warning border-warning/30',
  staff: 'bg-muted text-muted-foreground border-border',
  sponsor: 'bg-accent/15 text-accent border-accent/20',
  volunteer: 'bg-success/15 text-success border-success/20',
  other: 'bg-muted text-muted-foreground border-border',
};

const rsvpColors: Record<RSVPStatus, string> = {
  invited: 'bg-info/20 text-info',
  confirmed: 'bg-success/20 text-success',
  declined: 'bg-destructive/20 text-destructive',
  waitlist: 'bg-warning/20 text-warning',
  checked_in: 'bg-primary/20 text-primary',
};

export default function EventGuests() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const guests = useEventStore((s) => s.guests);
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);

  const event = events.find((item) => item.id === eventId);
  const analytics = event
    ? buildEventAnalytics({ event, guests, versions, layoutObjects, seatingAssignments, seatingRules })
    : null;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<GuestCategory | 'all'>('all');
  const [rsvpFilter, setRsvpFilter] = useState<RSVPStatus | 'all'>('all');

  const eventGuests = useMemo(() => {
    return guests
      .filter((g) => g.eventId === eventId)
      .filter((g) => categoryFilter === 'all' || g.category === categoryFilter)
      .filter((g) => rsvpFilter === 'all' || g.rsvpStatus === rsvpFilter)
      .filter((g) =>
        search === '' ||
        `${g.firstName} ${g.lastName} ${g.organization} ${g.email} ${g.notes}`.toLowerCase().includes(search.toLowerCase())
      );
  }, [guests, eventId, search, categoryFilter, rsvpFilter]);

  const tableMap = useMemo(() => {
    if (!analytics) return new Map<string, string>();
    const result = new Map<string, string>();
    analytics.assignments.forEach((assignment) => {
      const table = analytics.tables.find((candidate) => candidate.id === assignment.tableId);
      if (table) result.set(assignment.guestId, table.name);
    });
    return result;
  }, [analytics]);

  const allEventGuests = guests.filter((g) => g.eventId === eventId);
  const stats = {
    total: allEventGuests.length,
    confirmed: allEventGuests.filter((g) => g.rsvpStatus === 'confirmed').length,
    declined: allEventGuests.filter((g) => g.rsvpStatus === 'declined').length,
    invited: allEventGuests.filter((g) => g.rsvpStatus === 'invited').length,
    waitlist: allEventGuests.filter((g) => g.rsvpStatus === 'waitlist').length,
  };

  const categories: (GuestCategory | 'all')[] = ['all', 'donor', 'scholarship_recipient', 'board_member', 'vip', 'staff', 'family', 'sponsor', 'volunteer', 'other'];
  const rsvpStatuses: (RSVPStatus | 'all')[] = ['all', 'invited', 'confirmed', 'declined', 'waitlist', 'checked_in'];

  if (!event || !analytics) return <div className="p-8 text-muted-foreground">Event not found</div>;

  return (
    <div className="p-8 max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary/80 mb-2">
            <Sparkles className="w-3.5 h-3.5" /> guest intelligence
          </div>
          <h1 className="text-3xl font-bold text-foreground">Guests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            See who is confirmed, who is still in motion, and where high-touch placement work remains.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2"><Upload className="w-3.5 h-3.5" />Import CSV</Button>
          <Button size="sm">Add Guest</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="metric-card">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total</div>
          <p className="text-2xl font-bold font-mono text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Guests on this event.</p>
        </div>
        <div className="metric-card">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Confirmed</div>
          <p className="text-2xl font-bold font-mono text-foreground">{stats.confirmed}</p>
          <p className="text-xs text-muted-foreground">Committed attendees.</p>
        </div>
        <div className="metric-card">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Pending RSVP</div>
          <p className="text-2xl font-bold font-mono text-foreground">{stats.invited}</p>
          <p className="text-xs text-muted-foreground">Needs follow-up.</p>
        </div>
        <div className="metric-card">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Waitlist</div>
          <p className="text-2xl font-bold font-mono text-foreground">{stats.waitlist}</p>
          <p className="text-xs text-muted-foreground">Hold flex seats for these guests.</p>
        </div>
        <div className="metric-card">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Accessibility</div>
          <p className="text-2xl font-bold font-mono text-foreground">{analytics.accessibilityGuests.length}</p>
          <p className="text-xs text-muted-foreground">Needs layout-aware placement.</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search guests, orgs, notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${categoryFilter === cat ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  {cat === 'all' ? 'All' : categoryLabels[cat]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1 flex-wrap mb-4">
            {rsvpStatuses.map((status) => (
              <button
                key={status}
                onClick={() => setRsvpFilter(status)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${rsvpFilter === status ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                {status === 'all' ? 'All RSVP' : status.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-border/60">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Guest</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Category</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">RSVP</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Organization</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Seat / Table</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Signals</th>
                </tr>
              </thead>
              <tbody>
                {eventGuests.map((guest) => {
                  const seatedTable = tableMap.get(guest.id);
                  const hasSignals = Boolean(guest.dietaryRestrictions || guest.accessibilityNeeds || guest.tablePreference || guest.seatingPreference);

                  return (
                    <tr key={guest.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors align-top">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{guest.displayName}</p>
                          <div className="mt-1 space-y-1">
                            {guest.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{guest.email}</p>}
                            {guest.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{guest.phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-xs ${categoryColors[guest.category]}`}>
                          {categoryLabels[guest.category]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${rsvpColors[guest.rsvpStatus]}`}>
                          <span className="status-dot" style={{ width: 6, height: 6 }} />
                          {guest.rsvpStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{guest.organization || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        <div>{seatedTable || 'Unassigned'}</div>
                        <div className="text-xs font-mono text-muted-foreground/80">Party {guest.partySize}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1 max-w-[260px]">
                          {guest.accessibilityNeeds && (
                            <p className="text-xs text-info">Accessibility: {guest.accessibilityNeeds}</p>
                          )}
                          {guest.dietaryRestrictions && (
                            <p className="text-xs text-warning">Dietary: {guest.dietaryRestrictions}</p>
                          )}
                          {guest.tablePreference && (
                            <p className="text-xs text-muted-foreground">Table pref: {guest.tablePreference}</p>
                          )}
                          {guest.seatingPreference && (
                            <p className="text-xs text-muted-foreground">Seat pref: {guest.seatingPreference}</p>
                          )}
                          {!hasSignals && <p className="text-xs text-muted-foreground">No special signals recorded</p>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {eventGuests.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">No guests match the current filters</div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Watchlist</h3>
            <div className="space-y-3">
              {analytics.insights.slice(0, 4).map((insight) => (
                <div key={insight.id} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className={
                      insight.severity === 'critical'
                        ? 'bg-destructive/15 text-destructive border-destructive/30'
                        : insight.severity === 'warning'
                          ? 'bg-warning/15 text-warning border-warning/30'
                          : insight.severity === 'success'
                            ? 'bg-success/15 text-success border-success/30'
                            : 'bg-info/15 text-info border-info/30'
                    }>
                      {insight.severity}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">{insight.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{insight.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">High-touch guests</h3>
            <div className="space-y-3">
              {analytics.eventGuests
                .filter((guest) => guest.accessibilityNeeds || guest.category === 'vip' || guest.category === 'board_member' || Boolean(guest.seatingPreference))
                .slice(0, 6)
                .map((guest) => (
                  <div key={guest.id} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{guest.displayName}</p>
                      <Badge variant="outline" className={`text-xs ${categoryColors[guest.category]}`}>{categoryLabels[guest.category]}</Badge>
                    </div>
                    <div className="mt-2 space-y-1">
                      {guest.accessibilityNeeds && <p className="text-xs text-info">Accessibility: {guest.accessibilityNeeds}</p>}
                      {guest.seatingPreference && <p className="text-xs text-muted-foreground">Preference: {guest.seatingPreference}</p>}
                      {guest.tablePreference && <p className="text-xs text-muted-foreground">Table ask: {guest.tablePreference}</p>}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="glass-panel p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <h3 className="text-sm font-semibold text-foreground">Follow-up pressure</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {analytics.invitedGuests.length} invited guest{analytics.invitedGuests.length === 1 ? '' : 's'} still need RSVP follow-up and {analytics.waitlistGuests.length} remain on waitlist.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
