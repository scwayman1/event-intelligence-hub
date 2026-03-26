import { useParams, Link } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { 
  Users, CheckCircle, XCircle, AlertTriangle, Grid3X3, 
  LayoutGrid, GitBranch, Clock, ArrowRight, Accessibility
} from 'lucide-react';

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
  const guests = useEventStore((s) => s.guests);
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);

  const event = events.find((e) => e.id === eventId);
  if (!event) return <div className="p-8 text-muted-foreground">Event not found</div>;

  const eventGuests = guests.filter((g) => g.eventId === eventId);
  const confirmed = eventGuests.filter((g) => g.rsvpStatus === 'confirmed').length;
  const declined = eventGuests.filter((g) => g.rsvpStatus === 'declined').length;
  const invited = eventGuests.filter((g) => g.rsvpStatus === 'invited').length;
  const activeVersion = versions.find((v) => v.id === event.activeVersionId);
  const versionObjects = activeVersion ? layoutObjects.filter((o) => o.versionId === activeVersion.id) : [];
  const tables = versionObjects.filter((o) => ['round_table', 'rect_table'].includes(o.type));
  const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
  const versionSeating = activeVersion ? seatingAssignments.filter((a) => a.versionId === activeVersion.id) : [];
  const assignedGuestIds = new Set(versionSeating.map((a) => a.guestId));
  const unassigned = eventGuests.filter((g) => g.rsvpStatus === 'confirmed' && !assignedGuestIds.has(g.id)).length;
  const accessibilityGuests = eventGuests.filter((g) => g.accessibilityNeeds).length;

  const quickLinks = [
    { label: 'Layout Editor', path: 'layout', icon: LayoutGrid },
    { label: 'Guest List', path: 'guests', icon: Users },
    { label: 'Seating Plan', path: 'seating', icon: Grid3X3 },
    { label: 'Versions', path: 'versions', icon: GitBranch },
  ];

  const alerts = [
    ...(unassigned > 0 ? [{ type: 'warning', message: `${unassigned} confirmed guests unassigned` }] : []),
    ...(invited > 0 ? [{ type: 'info', message: `${invited} guests awaiting RSVP` }] : []),
    ...(accessibilityGuests > 0 ? [{ type: 'info', message: `${accessibilityGuests} guests with accessibility needs` }] : []),
  ];

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">{event.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{event.venue} · <span className="font-mono">{event.date}</span> · {event.time}</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
        <MetricCard label="Total Guests" value={eventGuests.length} icon={Users} />
        <MetricCard label="Confirmed" value={confirmed} icon={CheckCircle} accent="text-success" />
        <MetricCard label="Declined" value={declined} icon={XCircle} accent="text-destructive" />
        <MetricCard label="Tables" value={tables.length} icon={Grid3X3} />
        <MetricCard label="Capacity" value={totalCapacity} icon={LayoutGrid} />
        <MetricCard label="Unassigned" value={unassigned} icon={AlertTriangle} accent={unassigned > 0 ? 'text-warning' : ''} />
        <MetricCard label="Accessibility" value={accessibilityGuests} icon={Accessibility} accent="text-info" />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-8">
          {alerts.map((alert, i) => (
            <div key={i} className={`glass-panel px-4 py-3 flex items-center gap-3 text-sm ${alert.type === 'warning' ? 'border-warning/30' : 'border-info/30'}`}>
              <AlertTriangle className={`w-4 h-4 ${alert.type === 'warning' ? 'text-warning' : 'text-info'}`} />
              <span className="text-foreground">{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
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

      {/* Version info + Activity */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Active Version</h3>
          {activeVersion ? (
            <div>
              <p className="font-medium text-foreground">{activeVersion.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{activeVersion.notes}</p>
              <p className="text-xs text-muted-foreground mt-2 font-mono">Updated {new Date(activeVersion.updatedAt).toLocaleDateString()}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active version</p>
          )}
        </div>

        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Recent Activity</h3>
          <div className="space-y-3">
            {[
              { action: 'Seating updated for Donor Table A', time: '2 hours ago' },
              { action: 'RSVP confirmed: Mayor Maria Gonzalez', time: '1 day ago' },
              { action: 'Rain Plan version created', time: '3 days ago' },
              { action: '3 new scholarship recipients added', time: '5 days ago' },
            ].map((item, i) => (
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
      </div>
    </div>
  );
}
