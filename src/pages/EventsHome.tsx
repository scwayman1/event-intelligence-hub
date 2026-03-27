import { Link } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { AlertTriangle, Calendar, ChevronRight, Clock3, Grid3X3, MapPin, Search, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useMemo, useState } from 'react';
import { buildEventAnalytics } from '@/lib/event-analytics';

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
  const getOrgEvents = useEventStore((s) => s.getOrgEvents);
  const getActiveOrg = useEventStore((s) => s.getActiveOrg);
  const activeOrg = getActiveOrg();
  const events = getOrgEvents();
  const getOrgGuests = useEventStore((s) => s.getOrgGuests);
  const guests = getOrgGuests();
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);
  const [search, setSearch] = useState('');

  const eventCards = useMemo(() => {
    return events.map((event) => ({
      event,
      analytics: buildEventAnalytics({ event, guests, versions, layoutObjects, seatingAssignments, seatingRules }),
    }));
  }, [events, guests, versions, layoutObjects, seatingAssignments, seatingRules]);

  const filtered = eventCards.filter(({ event }) =>
    event.name.toLowerCase().includes(search.toLowerCase()) ||
    event.venue.toLowerCase().includes(search.toLowerCase())
  );

  const criticalCount = filtered.filter(({ analytics }) => analytics.insights.some((insight) => insight.severity === 'critical')).length;
  const avgReadiness = filtered.length
    ? Math.round(filtered.reduce((sum, item) => sum + item.analytics.readinessScore, 0) / filtered.length)
    : 0;

  return (
    <div className="p-8 max-w-7xl space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary/80 mb-2">
            <Sparkles className="w-3.5 h-3.5" /> portfolio view
          </div>
          <h1 className="text-3xl font-bold text-foreground">Event operations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Readiness, guest pressure, and layout health for{' '}
            <span className="font-semibold text-foreground">{activeOrg?.name ?? 'all organizations'}</span>.
          </p>
        </div>
        <Button size="sm" className="gap-2">
          Create Event
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="metric-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider"><Calendar className="w-3.5 h-3.5" /> active events</div>
          <p className="text-2xl font-bold font-mono text-foreground">{filtered.length}</p>
          <p className="text-xs text-muted-foreground">Search respects event name and venue.</p>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider"><Clock3 className="w-3.5 h-3.5" /> average readiness</div>
          <p className="text-2xl font-bold font-mono text-foreground">{avgReadiness}</p>
          <p className="text-xs text-muted-foreground">Composite score across seating, layout, and rules.</p>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider"><AlertTriangle className="w-3.5 h-3.5" /> critical events</div>
          <p className="text-2xl font-bold font-mono text-foreground">{criticalCount}</p>
          <p className="text-xs text-muted-foreground">Events with front-of-house or seating blockers.</p>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider"><Users className="w-3.5 h-3.5" /> total guest load</div>
          <p className="text-2xl font-bold font-mono text-foreground">{filtered.reduce((sum, item) => sum + item.analytics.eventGuests.length, 0)}</p>
          <p className="text-xs text-muted-foreground">Visible events only.</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search events or venues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-card border-border"
        />
      </div>

      <div className="grid gap-4">
        {filtered.map(({ event, analytics }) => {
          const topInsight = analytics.insights[0];
          const pendingPipeline = analytics.invitedGuests.length + analytics.waitlistGuests.length;

          return (
            <Link
              key={event.id}
              to={`/events/${event.id}`}
              className="glass-panel p-5 hover:border-primary/30 transition-all group"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[280px] space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors truncate">
                      {event.name}
                    </h3>
                    <Badge variant="outline" className={statusColors[event.status]}>
                      {event.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                      {typeLabels[event.type]}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-5 text-sm text-muted-foreground flex-wrap">
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
                      <span className="font-mono text-xs">{analytics.confirmedGuests.length}/{analytics.eventGuests.length} confirmed</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Grid3X3 className="w-3.5 h-3.5" />
                      <span className="font-mono text-xs">{analytics.tables.length} tables · {analytics.totalCapacity} seats</span>
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Readiness</div>
                      <div className="text-lg font-semibold text-foreground mt-1">{analytics.readinessScore}</div>
                      <div className="text-xs text-muted-foreground">{analytics.progressLabel}</div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Unassigned confirmed</div>
                      <div className="text-lg font-semibold text-foreground mt-1">{analytics.unassignedConfirmed.length}</div>
                      <div className="text-xs text-muted-foreground">Guests still needing placement</div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pipeline pressure</div>
                      <div className="text-lg font-semibold text-foreground mt-1">{pendingPipeline}</div>
                      <div className="text-xs text-muted-foreground">Invited + waitlist still in motion</div>
                    </div>
                  </div>

                  {topInsight && (
                    <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-3">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className={
                          topInsight.severity === 'critical'
                            ? 'bg-destructive/15 text-destructive border-destructive/30'
                            : topInsight.severity === 'warning'
                              ? 'bg-warning/15 text-warning border-warning/30'
                              : topInsight.severity === 'success'
                                ? 'bg-success/15 text-success border-success/30'
                                : 'bg-info/15 text-info border-info/30'
                        }>
                          {topInsight.severity}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">{topInsight.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{topInsight.detail}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-4">
                  <div className="text-right min-w-[80px]">
                    <div className="text-3xl font-bold font-mono text-foreground">{analytics.readinessScore}</div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">score</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
