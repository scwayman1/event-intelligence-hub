import { AlertTriangle, CheckCircle2, Clock3, Grid3X3, MapPin, Sparkles, Users, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EventAnalytics } from '@/lib/event-analytics';

function SeverityPill({ severity }: { severity: 'critical' | 'warning' | 'info' | 'success' }) {
  const styles = {
    critical: 'bg-destructive/15 text-destructive border-destructive/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
    info: 'bg-info/15 text-info border-info/30',
    success: 'bg-success/15 text-success border-success/30',
  } as const;

  return <Badge variant="outline" className={styles[severity]}>{severity}</Badge>;
}

export function EventCommandCenter({ analytics }: { analytics: EventAnalytics }) {
  const seatedRate = analytics.confirmedGuests.length
    ? Math.round((analytics.assignedConfirmed / analytics.confirmedGuests.length) * 100)
    : 100;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
      <section className="glass-panel p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary/80 mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              command center
            </div>
            <h2 className="text-xl font-semibold text-foreground">Planner readiness for {analytics.event.name}</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              A single place to understand RSVP health, seating pressure, layout readiness, and the next operational moves.
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold font-mono text-foreground">{analytics.readinessScore}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{analytics.progressLabel}</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-2"><Users className="w-3.5 h-3.5" /> RSVP health</div>
            <div className="text-xl font-semibold text-foreground">{analytics.confirmedGuests.length} confirmed</div>
            <div className="text-xs text-muted-foreground mt-1">{analytics.invitedGuests.length} pending · {analytics.waitlistGuests.length} waitlist</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-2"><Grid3X3 className="w-3.5 h-3.5" /> Seating coverage</div>
            <div className="text-xl font-semibold text-foreground">{seatedRate}% seated</div>
            <div className="text-xs text-muted-foreground mt-1">{analytics.assignedConfirmed}/{analytics.confirmedGuests.length} confirmed guests placed</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-2"><MapPin className="w-3.5 h-3.5" /> Floor capacity</div>
            <div className="text-xl font-semibold text-foreground">{analytics.totalCapacity}</div>
            <div className="text-xs text-muted-foreground mt-1">{analytics.tables.length} tables in active version</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-2"><Waves className="w-3.5 h-3.5" /> Front of house</div>
            <div className="text-xl font-semibold text-foreground">{analytics.frontOfHouseReady ? 'Ready' : 'Missing'}</div>
            <div className="text-xs text-muted-foreground mt-1">Check-in and arrival flow visibility</div>
          </div>
        </div>

        <div className="space-y-3">
          {analytics.insights.slice(0, 4).map((insight) => (
            <div key={insight.id} className="rounded-lg border border-border/70 bg-card/70 p-3 flex items-start gap-3">
              <div className={cn(
                'mt-0.5 rounded-full p-1.5',
                insight.severity === 'critical' && 'bg-destructive/15 text-destructive',
                insight.severity === 'warning' && 'bg-warning/15 text-warning',
                insight.severity === 'info' && 'bg-info/15 text-info',
                insight.severity === 'success' && 'bg-success/15 text-success',
              )}>
                {insight.severity === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{insight.title}</p>
                  <SeverityPill severity={insight.severity} />
                </div>
                <p className="text-sm text-muted-foreground">{insight.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary/80">
          <Clock3 className="w-3.5 h-3.5" /> next moves
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Resolve the unassigned queue</p>
            <p className="text-sm text-muted-foreground mt-1">
              {analytics.unassignedConfirmed.length > 0
                ? `There are ${analytics.unassignedConfirmed.length} confirmed guests still waiting for seats.`
                : 'Every confirmed guest is already assigned in the active version.'}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Protect high-visibility tables</p>
            <p className="text-sm text-muted-foreground mt-1">
              {analytics.frontTables.length > 0
                ? `${analytics.frontTables.length} front-zone tables shape the donor and VIP experience.`
                : 'Create or reposition front-zone tables near stage and ceremony sightlines.'}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Use RSVP pipeline as flex inventory</p>
            <p className="text-sm text-muted-foreground mt-1">
              Hold capacity for {analytics.invitedGuests.length + analytics.waitlistGuests.length} unsettled guests without collapsing premium seating quality.
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild className="justify-start gap-2">
            <Link to={`/events/${analytics.event.id}/seating`}>
              <Grid3X3 className="w-4 h-4" /> Refine seating
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start gap-2">
            <Link to={`/events/${analytics.event.id}/layout`}>
              <MapPin className="w-4 h-4" /> Tune layout
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
