import { useParams, Link } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Download,
  Grid3X3,
  Home,
  Info,
  LayoutGrid,
  MapPin,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { buildEventAnalytics, type EventInsight } from '@/lib/event-analytics';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EventNotFound } from '@/components/EventNotFound';

/* ------------------------------------------------------------------ */
/*  Readiness Ring                                                     */
/* ------------------------------------------------------------------ */

function ReadinessRing({ score, label }: { score: number; label: string }) {
  const radius = 80;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const size = 200;
  const center = size / 2;

  const color =
    score > 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-red-500';
  const trackColor =
    score > 80
      ? 'stroke-emerald-500/15'
      : score >= 50
        ? 'stroke-amber-500/15'
        : 'stroke-red-500/15';
  const glowColor =
    score > 80
      ? 'drop-shadow-[0_0_12px_rgba(16,185,129,0.4)]'
      : score >= 50
        ? 'drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]'
        : 'drop-shadow-[0_0_12px_rgba(239,68,68,0.4)]';
  const labelBg =
    score > 80
      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
      : score >= 50
        ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
        : 'bg-red-500/10 text-red-600 border-red-500/30';

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg width={size} height={size} className={glowColor}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className={trackColor}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className={`${color} transition-all duration-700`}
            style={{
              stroke: 'currentColor',
              strokeDasharray: circumference,
              strokeDashoffset: offset,
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-5xl font-bold font-mono tracking-tight ${color}`}>
            {score}
          </span>
          <span className="text-xs text-muted-foreground mt-1">/ 100</span>
        </div>
      </div>
      <div className="text-center space-y-1.5">
        <Badge variant="outline" className={`text-xs font-semibold px-3 py-0.5 ${labelBg}`}>
          {label}
        </Badge>
        <p className="text-xs text-muted-foreground">Event Readiness Score</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Insight Card                                                       */
/* ------------------------------------------------------------------ */

const severityConfig: Record<
  EventInsight['severity'],
  { border: string; bg: string; icon: React.ElementType; iconColor: string; ring: string }
> = {
  critical: {
    border: 'border-l-red-500',
    bg: 'bg-red-500/5 hover:bg-red-500/10',
    icon: XCircle,
    iconColor: 'text-red-500',
    ring: 'ring-red-500/20',
  },
  warning: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-500/5 hover:bg-amber-500/10',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    ring: 'ring-amber-500/20',
  },
  info: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-500/5 hover:bg-blue-500/10',
    icon: Info,
    iconColor: 'text-blue-500',
    ring: 'ring-blue-500/20',
  },
  success: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-500/5 hover:bg-emerald-500/10',
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    ring: 'ring-emerald-500/20',
  },
};

function InsightCard({ insight }: { insight: EventInsight }) {
  const cfg = severityConfig[insight.severity];
  const Icon = cfg.icon;
  return (
    <div
      className={`rounded-lg border border-l-4 ${cfg.border} ${cfg.bg} p-4 flex items-start gap-3 transition-colors`}
    >
      <div className={`p-1.5 rounded-md ring-1 ${cfg.ring} shrink-0`}>
        <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug">{insight.title}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.detail}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mini Stacked Bar                                                   */
/* ------------------------------------------------------------------ */

function StackedBar({
  segments,
}: {
  segments: { value: number; color: string; label: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <div className="h-2.5 rounded-full bg-muted w-full" />;
  return (
    <div
      className="flex h-2.5 rounded-full overflow-hidden w-full bg-muted"
      title={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((seg, i) => (
          <div
            key={i}
            className={`${seg.color} transition-all`}
            style={{ width: `${(seg.value / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  iconBg,
  iconFg,
  label,
  value,
  children,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconFg: string;
  label: string;
  value: string | number;
  children?: React.ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className={`p-2 rounded-lg ${iconBg}`}>
            <Icon className={`w-4 h-4 ${iconFg}`} />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
        </div>
        <p className="text-2xl font-bold font-mono tracking-tight text-foreground">{value}</p>
        {children && <div className="mt-3">{children}</div>}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Event type formatting                                              */
/* ------------------------------------------------------------------ */

function formatEventType(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */

export default function EventDashboard() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const guests = useEventStore((s) => s.guests);
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);

  const event = events.find((e) => e.id === eventId);
  if (!event) return <EventNotFound />;

  const analytics = buildEventAnalytics({
    event,
    guests,
    versions,
    layoutObjects,
    seatingAssignments,
    seatingRules,
  });

  const seatingCoverage =
    analytics.confirmedGuests.length > 0
      ? Math.round(
          (analytics.assignedConfirmed / analytics.confirmedGuests.length) * 100,
        )
      : 0;

  const capacityUtilization =
    analytics.totalCapacity > 0
      ? Math.round(
          (analytics.seatedGuests.length / analytics.totalCapacity) * 100,
        )
      : 0;

  const quickActions = [
    {
      label: 'Open Layout Editor',
      path: 'layout',
      icon: LayoutGrid,
      description: 'Design floor plan',
      accent: 'group-hover:text-blue-500',
    },
    {
      label: 'Manage Guests',
      path: 'guests',
      icon: Users,
      description: 'RSVP & contacts',
      accent: 'group-hover:text-violet-500',
    },
    {
      label: 'View Seating',
      path: 'seating',
      icon: Grid3X3,
      description: 'Table assignments',
      accent: 'group-hover:text-emerald-500',
    },
    {
      label: 'Export Report',
      path: 'versions',
      icon: Download,
      description: 'Versions & export',
      accent: 'group-hover:text-orange-500',
    },
  ];

  const criticalCount = analytics.insights.filter(
    (i) => i.severity === 'critical',
  ).length;
  const warningCount = analytics.insights.filter(
    (i) => i.severity === 'warning',
  ).length;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* ---- Event Header ---- */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              {event.name}
            </h1>
            <Badge variant="secondary" className="text-xs capitalize font-medium">
              {formatEventType(event.type)}
            </Badge>
            <Badge
              variant="outline"
              className={
                event.status === 'active'
                  ? 'border-emerald-500/50 text-emerald-600 bg-emerald-500/10'
                  : 'border-muted-foreground/30'
              }
            >
              {event.status}
            </Badge>
          </div>
          <div className="flex items-center gap-5 text-sm text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4" />
              {formatDate(event.date)} at {event.time}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {event.venue}
            </span>
          </div>
        </div>
      </div>

      {/* ---- Hero: Readiness Ring + Stats Grid ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
        {/* Readiness Ring hero card */}
        <Card className="flex items-center justify-center p-10 bg-gradient-to-br from-background to-muted/40 border-2">
          <ReadinessRing
            score={analytics.readinessScore}
            label={analytics.progressLabel}
          />
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
          {/* Total Guests */}
          <StatCard
            icon={Users}
            iconBg="bg-blue-500/10"
            iconFg="text-blue-500"
            label="Total Guests"
            value={analytics.eventGuests.length}
          >
            <StackedBar
              segments={[
                {
                  value: analytics.confirmedGuests.length,
                  color: 'bg-emerald-500',
                  label: 'Confirmed',
                },
                {
                  value: analytics.checkedInGuests.length,
                  color: 'bg-blue-500',
                  label: 'Checked in',
                },
                {
                  value: analytics.invitedGuests.length,
                  color: 'bg-amber-400',
                  label: 'Invited',
                },
                {
                  value: analytics.waitlistGuests.length,
                  color: 'bg-purple-400',
                  label: 'Waitlist',
                },
                {
                  value: analytics.declinedGuests.length,
                  color: 'bg-red-400',
                  label: 'Declined',
                },
              ]}
            />
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {analytics.confirmedGuests.length} confirmed
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {analytics.invitedGuests.length} invited
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                {analytics.declinedGuests.length} declined
              </span>
            </div>
          </StatCard>

          {/* Seating Coverage */}
          <StatCard
            icon={CheckCircle2}
            iconBg="bg-emerald-500/10"
            iconFg="text-emerald-500"
            label="Seating Coverage"
            value={`${seatingCoverage}%`}
          >
            <div className="space-y-1.5">
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    seatingCoverage >= 80
                      ? 'bg-emerald-500'
                      : seatingCoverage >= 50
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${seatingCoverage}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {analytics.assignedConfirmed} of{' '}
                {analytics.confirmedGuests.length} confirmed seated
              </p>
            </div>
          </StatCard>

          {/* Table Count */}
          <StatCard
            icon={Grid3X3}
            iconBg="bg-violet-500/10"
            iconFg="text-violet-500"
            label="Tables"
            value={analytics.tables.length}
          >
            <div className="space-y-1.5">
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    capacityUtilization >= 90
                      ? 'bg-red-500'
                      : capacityUtilization >= 60
                        ? 'bg-amber-500'
                        : 'bg-violet-500'
                  }`}
                  style={{
                    width: `${Math.min(capacityUtilization, 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {analytics.seatedGuests.length} / {analytics.totalCapacity}{' '}
                capacity ({capacityUtilization}%)
              </p>
            </div>
          </StatCard>

          {/* Household Integrity */}
          <StatCard
            icon={Home}
            iconBg="bg-orange-500/10"
            iconFg="text-orange-500"
            label="Household Integrity"
            value={
              analytics.householdsSplitCount === 0
                ? 'Clean'
                : `${analytics.householdsSplitCount} split`
            }
          >
            <div className="space-y-1">
              {analytics.householdsSplitCount === 0 ? (
                <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  All households seated together
                </p>
              ) : (
                <p className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {analytics.householdsSplitCount} household
                  {analytics.householdsSplitCount === 1 ? '' : 's'} split across
                  tables
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                {analytics.accessibilityGuests.length} guest
                {analytics.accessibilityGuests.length === 1 ? '' : 's'} with
                accessibility needs
              </p>
            </div>
          </StatCard>
        </div>
      </div>

      {/* ---- Quick Actions ---- */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.path}
              to={`/events/${eventId}/${action.path}`}
            >
              <Button
                variant="outline"
                className="w-full h-auto py-5 px-4 flex flex-col items-center gap-2.5 hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm transition-all group"
                asChild
              >
                <span>
                  <action.icon
                    className={`w-5 h-5 text-muted-foreground ${action.accent} transition-colors`}
                  />
                  <span className="text-sm font-medium">{action.label}</span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    {action.description}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </span>
              </Button>
            </Link>
          ))}
        </div>
      </div>

      {/* ---- Insights Panel ---- */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Insights
          </h2>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge
                variant="outline"
                className="border-red-500/40 text-red-600 bg-red-500/5 text-[10px]"
              >
                {criticalCount} critical
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge
                variant="outline"
                className="border-amber-500/40 text-amber-600 bg-amber-500/5 text-[10px]"
              >
                {warningCount} warning{warningCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...analytics.insights]
            .sort((a, b) => {
              const order = { critical: 0, warning: 1, info: 2, success: 3 };
              return order[a.severity] - order[b.severity];
            })
            .map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
        </div>
      </div>

      {/* ---- Table Occupancy ---- */}
      {analytics.tableSummaries.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Table Occupancy
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {analytics.tableSummaries.slice(0, 8).map((table) => {
              const pct = Math.round(table.occupancyRate * 100);
              const barColor =
                pct >= 90
                  ? 'bg-red-500'
                  : pct >= 70
                    ? 'bg-amber-500'
                    : 'bg-primary';
              return (
                <Card
                  key={table.tableId}
                  className="overflow-hidden hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {table.name}
                      </p>
                      <Badge
                        variant="outline"
                        className="text-[10px] capitalize shrink-0 ml-2"
                      >
                        {table.zone}
                      </Badge>
                    </div>
                    <p className="text-lg font-bold font-mono text-foreground">
                      {table.assigned}
                      <span className="text-sm font-normal text-muted-foreground">
                        {' '}
                        / {table.capacity}
                      </span>
                    </p>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      {pct}% occupied
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
