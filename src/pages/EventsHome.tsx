import { Link } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarCheck,
  ChevronRight,
  Clock3,
  Grid3X3,
  MapPin,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useMemo, useState } from 'react';
import { buildEventAnalytics } from '@/lib/event-analytics';

const typeLabels: Record<string, string> = {
  ceremony: 'Ceremony', dinner: 'Dinner', gala: 'Gala', reception: 'Reception',
  banquet: 'Banquet', commencement: 'Commencement', other: 'Other',
};

const typeAccentColors: Record<string, string> = {
  gala: 'from-purple-500 to-violet-600',
  dinner: 'from-amber-500 to-orange-600',
  ceremony: 'from-emerald-500 to-teal-600',
  reception: 'from-sky-500 to-blue-600',
  banquet: 'from-rose-500 to-pink-600',
  commencement: 'from-indigo-500 to-blue-600',
  other: 'from-slate-500 to-gray-600',
};

const typeAccentBg: Record<string, string> = {
  gala: 'bg-purple-500/10',
  dinner: 'bg-amber-500/10',
  ceremony: 'bg-emerald-500/10',
  reception: 'bg-sky-500/10',
  banquet: 'bg-rose-500/10',
  commencement: 'bg-indigo-500/10',
  other: 'bg-slate-500/10',
};

const statusColors: Record<string, string> = {
  planning: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
  archived: 'bg-muted text-muted-foreground border-border',
};

const statusDot: Record<string, string> = {
  planning: 'bg-blue-400',
  active: 'bg-emerald-400',
  completed: 'bg-muted-foreground',
  archived: 'bg-muted-foreground',
};

/** Inline SVG circular progress ring */
function ReadinessRing({ score, size = 56, strokeWidth = 4 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 85 ? 'stroke-emerald-400' : score >= 65 ? 'stroke-amber-400' : 'stroke-rose-400';

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-muted/40"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

function formatEventDate(dateStr: string) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function EventsHome() {
  const events = useEventStore((s) => s.events);
  const guests = useEventStore((s) => s.guests);
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

  const totalGuests = filtered.reduce((sum, item) => sum + item.analytics.eventGuests.length, 0);
  const avgReadiness = filtered.length
    ? Math.round(filtered.reduce((sum, item) => sum + item.analytics.readinessScore, 0) / filtered.length)
    : 0;
  const upcomingCount = filtered.filter(({ event }) => {
    try { return new Date(event.date) >= new Date(); } catch { return false; }
  }).length;

  /* ─── Empty state ──────────────────────────────────────────────── */
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
        {/* Abstract illustration-like icon cluster */}
        <div className="relative mb-8">
          <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Calendar className="w-12 h-12 text-primary/60" />
          </div>
          <div className="absolute -top-2 -right-2 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-400/70" />
          </div>
          <div className="absolute -bottom-2 -left-3 w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center">
            <Grid3X3 className="w-5 h-5 text-amber-400/70" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">No events yet</h2>
        <p className="text-muted-foreground max-w-md mb-8">
          Create your first event to start planning seating, managing guests, and tracking readiness -- all in one place.
        </p>
        <Button size="lg" className="gap-2 bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow">
          <Plus className="w-4 h-4" />
          Create your first event
        </Button>
      </div>
    );
  }

  /* ─── Main layout ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen animate-fade-in">
      {/* ── Hero Section ────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border/50">
        {/* Subtle dot-grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Gradient glow blobs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-8 py-10">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-primary/80 font-medium">
                <Sparkles className="w-3.5 h-3.5" /> portfolio overview
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight">
                <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                  Event Intelligence
                </span>{' '}
                <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                  Hub
                </span>
              </h1>
              <p className="text-base text-muted-foreground max-w-lg">
                Intelligent event planning, seating &amp; logistics.
                Monitor readiness, guest pressure, and layout health across your entire portfolio.
              </p>
            </div>
            <Button
              size="lg"
              className="gap-2 bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] transition-all"
            >
              <Plus className="w-4 h-4" />
              Create Event
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* ── Quick Stats Bar ───────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:border-border transition-colors">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono text-foreground">{filtered.length}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Events</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:border-border transition-colors">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono text-foreground">{totalGuests.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Guests</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:border-border transition-colors">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono text-foreground">{avgReadiness}<span className="text-sm text-muted-foreground font-normal">%</span></p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Readiness</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:border-border transition-colors">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <CalendarCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono text-foreground">{upcomingCount}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Upcoming</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Search ────────────────────────────────────────────── */}
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search events or venues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 bg-card/50 border-border/60 backdrop-blur-sm focus:border-primary/50 transition-colors"
          />
        </div>

        {/* ── Event Cards Grid ──────────────────────────────────── */}
        {filtered.length === 0 && events.length > 0 && (
          <div className="text-center py-16">
            <Search className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No events match your search.</p>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ event, analytics }) => {
            const seatingCoverage = analytics.confirmedGuests.length > 0
              ? Math.round((analytics.assignedConfirmed / analytics.confirmedGuests.length) * 100)
              : 0;
            const topInsight = analytics.insights[0];

            return (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className="group block"
              >
                <Card className="relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 hover:scale-[1.015] transition-all duration-300 h-full">
                  {/* Colored accent bar */}
                  <div className={`h-1 bg-gradient-to-r ${typeAccentColors[event.type] || typeAccentColors.other}`} />

                  <CardContent className="p-5 space-y-4">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <Badge variant="outline" className={`${statusColors[event.status]} text-[11px] font-medium px-2 py-0`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${statusDot[event.status]}`} />
                            {event.status}
                          </Badge>
                          <Badge variant="outline" className={`text-[11px] border-border/60 text-muted-foreground px-2 py-0 ${typeAccentBg[event.type]}`}>
                            {typeLabels[event.type]}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors truncate">
                          {event.name}
                        </h3>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-1 flex-shrink-0" />
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-xs">{formatEventDate(event.date)}</span>
                      </span>
                      <span className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-xs truncate">{event.venue}</span>
                      </span>
                    </div>

                    {/* Stats row with readiness ring */}
                    <div className="flex items-center gap-4 pt-1">
                      {/* Readiness ring */}
                      <div className="relative flex-shrink-0">
                        <ReadinessRing score={analytics.readinessScore} size={56} strokeWidth={4} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-sm font-bold font-mono text-foreground">{analytics.readinessScore}</span>
                        </div>
                      </div>

                      {/* Key stats */}
                      <div className="flex-1 grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-lg font-bold font-mono text-foreground leading-tight">
                            {analytics.eventGuests.length}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Guests</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold font-mono text-foreground leading-tight">
                            {seatingCoverage}<span className="text-xs text-muted-foreground font-normal">%</span>
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Seated</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold font-mono text-foreground leading-tight">
                            {analytics.tables.length}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tables</p>
                        </div>
                      </div>
                    </div>

                    {/* Seating progress bar */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                        <span>{analytics.confirmedGuests.length} confirmed / {analytics.totalCapacity} capacity</span>
                        <span className="font-mono">{seatingCoverage}%</span>
                      </div>
                      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${typeAccentColors[event.type] || typeAccentColors.other} transition-all duration-500`}
                          style={{ width: `${Math.min(seatingCoverage, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Top insight */}
                    {topInsight && (
                      <div className="flex items-start gap-2 text-xs rounded-lg bg-muted/30 border border-border/40 px-3 py-2">
                        {topInsight.severity === 'critical' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />}
                        {topInsight.severity === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />}
                        {topInsight.severity === 'success' && <Sparkles className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />}
                        {topInsight.severity === 'info' && <Clock3 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />}
                        <span className="text-muted-foreground leading-snug">{topInsight.title}</span>
                      </div>
                    )}

                    {/* Footer action hint */}
                    <div className="flex items-center gap-1 text-xs text-primary/0 group-hover:text-primary/80 transition-colors pt-1">
                      <span>Open event dashboard</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
