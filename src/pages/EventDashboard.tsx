import { useParams, Link } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { Accessibility, ArrowRight, CheckCircle, Clock, GitBranch, Grid3X3, LayoutGrid, Users } from 'lucide-react';
import { EventCommandCenter } from '@/components/EventCommandCenter';
import { buildEventAnalytics } from '@/lib/event-analytics';

function MetricCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: React.ElementType; accent?: string }) {
  return (
    <div className="metric-card">
      <div className="flex items-center justify-between">
        <Icon className={`w-4 h-4 ${accent || 'text-muted-foreground'}`} />
      </div>
      <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default function EventDashboard() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const getOrgGuests = useEventStore((s) => s.getOrgGuests);
  const guests = getOrgGuests();
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);

  const event = events.find((e) => e.id === eventId);
  if (!event) return <div className="p-8 text-muted-foreground">Event not found</div>;

  const analytics = buildEventAnalytics({ event, guests, versions, layoutObjects, seatingAssignments, seatingRules });
  const activeVersion = analytics.activeVersion;

  const quickLinks = [
    { label: 'Layout Editor', path: 'layout', icon: LayoutGrid },
    { label: 'Guest List', path: 'guests', icon: Users },
    { label: 'Seating Plan', path: 'seating', icon: Grid3X3 },
    { label: 'Versions', path: 'versions', icon: GitBranch },
  ];

  const operationsFeed = [
    analytics.unassignedConfirmed.length > 0
      ? { action: `${analytics.unassignedConfirmed.length} confirmed guest${analytics.unassignedConfirmed.length === 1 ? '' : 's'} still unassigned`, time: 'Action now' }
      : { action: 'Confirmed guest seating is fully covered', time: 'Healthy' },
    analytics.frontOfHouseReady
      ? { action: 'Arrival flow is mapped in the layout', time: 'Ready' }
      : { action: 'Check-in or registration still needs to be placed in layout', time: 'Blocking' },
    { action: `${analytics.donorScholarPairsSeated}/${analytics.donorScholarPairTargets} donor-scholar pairings satisfied`, time: 'Relationship logic' },
    { action: `${analytics.invitedGuests.length} invited and ${analytics.waitlistGuests.length} waitlist still moving`, time: 'Pipeline watch' },
  ];

  return (
    <div className="p-8 max-w-7xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{event.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{event.venue} · <span className="font-mono">{event.date}</span> · {event.time}</p>
      </div>

      <EventCommandCenter analytics={analytics} />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="Total Guests" value={analytics.eventGuests.length} icon={Users} />
        <MetricCard label="Confirmed" value={analytics.confirmedGuests.length} icon={CheckCircle} accent="text-success" />
        <MetricCard label="Tables" value={analytics.tables.length} icon={Grid3X3} />
        <MetricCard label="Capacity" value={analytics.totalCapacity} icon={LayoutGrid} />
        <MetricCard label="Unassigned" value={analytics.unassignedConfirmed.length} icon={Clock} accent={analytics.unassignedConfirmed.length > 0 ? 'text-warning' : ''} />
        <MetricCard label="Accessibility" value={analytics.accessibilityGuests.length} icon={Accessibility} accent="text-info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4">
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Quick actions</h3>
            <span className="text-xs text-muted-foreground">Move between core workflows fast</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {quickLinks.map((link) => (
              <Link
                key={link.path}
                to={`/events/${eventId}/${link.path}`}
                className="glass-panel p-4 hover:border-primary/30 transition-all group flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <link.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm font-medium text-foreground">{link.label}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Active version</h3>
          {activeVersion ? (
            <div className="space-y-3">
              <div>
                <p className="font-medium text-foreground">{activeVersion.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{activeVersion.notes}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Updated</div>
                  <div className="text-sm font-medium text-foreground mt-1">{new Date(activeVersion.updatedAt).toLocaleDateString()}</div>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Rules enabled</div>
                  <div className="text-sm font-medium text-foreground mt-1">{analytics.rules.filter((rule) => rule.enabled).length}/{analytics.rules.length}</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active version</p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Operational feed</h3>
          <div className="space-y-3">
            {operationsFeed.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-foreground">{item.action}</p>
                  <p className="text-xs text-muted-foreground font-mono">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Priority seating pressure</h3>
          <div className="space-y-3">
            {analytics.tableSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tables yet. Add tables in the Layout editor.</p>
            ) : (
              analytics.tableSummaries.slice(0, 4).map((table) => (
                <div key={table.tableId} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground truncate">{table.name}</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{table.zone} zone</p>
                    </div>
                    <p className="text-sm font-mono text-foreground">{table.assigned}/{table.capacity}</p>
                  </div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(table.occupancyRate * 100, 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
