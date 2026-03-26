import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useState, useMemo } from 'react';
import { Search, Plus, Upload, Filter, Users, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  const guests = useEventStore((s) => s.guests);
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
        `${g.firstName} ${g.lastName} ${g.organization} ${g.email}`.toLowerCase().includes(search.toLowerCase())
      );
  }, [guests, eventId, search, categoryFilter, rsvpFilter]);

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

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Guests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono">{stats.total}</span> total · <span className="font-mono text-success">{stats.confirmed}</span> confirmed · <span className="font-mono text-destructive">{stats.declined}</span> declined · <span className="font-mono text-info">{stats.invited}</span> pending
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2"><Upload className="w-3.5 h-3.5" />Import CSV</Button>
          <Button size="sm" className="gap-2"><Plus className="w-3.5 h-3.5" />Add Guest</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search guests..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
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
        <div className="flex gap-1">
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
      </div>

      {/* Table */}
      <div className="glass-panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Guest</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Category</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">RSVP</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Organization</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Party</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {eventGuests.map((guest) => (
              <tr key={guest.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{guest.displayName}</p>
                    <p className="text-xs text-muted-foreground">{guest.email}</p>
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
                <td className="px-4 py-3 text-sm text-muted-foreground">{guest.organization}</td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{guest.partySize}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{guest.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {eventGuests.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">No guests match the current filters</div>
        )}
      </div>
    </div>
  );
}
