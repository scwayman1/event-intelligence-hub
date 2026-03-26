import { Link } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { Plus, Search, Calendar, MapPin, Users, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

const typeLabels: Record<string, string> = {
  ceremony: 'Ceremony', dinner: 'Dinner', gala: 'Gala', reception: 'Reception',
  banquet: 'Banquet', commencement: 'Commencement', other: 'Other',
};

const statusColors: Record<string, string> = {
  planning: 'bg-info/20 text-info border-info/30',
  active: 'bg-success/20 text-success border-success/30',
  completed: 'bg-muted text-muted-foreground border-border',
  archived: 'bg-muted text-muted-foreground border-border',
};

export default function EventsHome() {
  const events = useEventStore((s) => s.events);
  const guests = useEventStore((s) => s.guests);
  const versions = useEventStore((s) => s.versions);
  const [search, setSearch] = useState('');

  const filtered = events.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.venue.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your event operations</p>
        </div>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Create Event
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-card border-border"
        />
      </div>

      {/* Event cards */}
      <div className="grid gap-4">
        {filtered.map((event) => {
          const eventGuests = guests.filter((g) => g.eventId === event.id);
          const confirmed = eventGuests.filter((g) => g.rsvpStatus === 'confirmed').length;
          const activeVersion = versions.find((v) => v.id === event.activeVersionId);

          return (
            <Link
              key={event.id}
              to={`/events/${event.id}`}
              className="glass-panel p-5 hover:border-primary/30 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {event.name}
                    </h3>
                    <Badge variant="outline" className={statusColors[event.status]}>
                      {event.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                      {typeLabels[event.type]}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="font-mono text-xs">{event.date}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {event.venue}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span className="font-mono text-xs">{confirmed}/{eventGuests.length} confirmed</span>
                    </span>
                  </div>

                  {activeVersion && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Active: <span className="text-foreground">{activeVersion.name}</span>
                    </p>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
