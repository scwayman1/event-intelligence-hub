import { Link, useNavigate } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarCheck,
  ChevronRight,
  Clock,
  Clock3,
  Copy,
  Crown,
  Grid3X3,
  Layers,
  MapPin,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useMemo, useState, useCallback } from 'react';
import { buildEventAnalytics } from '@/lib/event-analytics';
import EventCreateModal from '@/components/EventCreateModal';
import type { AppEvent, EventVersion } from '@/types/events';

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

const typeAccentSolid: Record<string, string> = {
  gala: 'bg-purple-500',
  dinner: 'bg-amber-500',
  ceremony: 'bg-emerald-500',
  reception: 'bg-sky-500',
  banquet: 'bg-rose-500',
  commencement: 'bg-indigo-500',
  other: 'bg-slate-500',
};

const typeAccentBg: Record<string, string> = {
  gala: 'bg-purple-500/10 text-purple-300',
  dinner: 'bg-amber-500/10 text-amber-300',
  ceremony: 'bg-emerald-500/10 text-emerald-300',
  reception: 'bg-sky-500/10 text-sky-300',
  banquet: 'bg-rose-500/10 text-rose-300',
  commencement: 'bg-indigo-500/10 text-indigo-300',
  other: 'bg-slate-500/10 text-slate-300',
};

const statusColors: Record<string, string> = {
  planning: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
  archived: 'bg-muted text-muted-foreground border-border',
};

const statusDot: Record<string, string> = {
  planning: 'bg-blue-400 shadow-sm shadow-blue-400/50',
  active: 'bg-emerald-400 shadow-sm shadow-emerald-400/50',
  completed: 'bg-muted-foreground',
  archived: 'bg-muted-foreground',
};

/** Inline SVG circular progress ring with glow effect */
function ReadinessRing({ score, size = 60, strokeWidth = 5 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 85 ? 'stroke-emerald-400' : score >= 65 ? 'stroke-amber-400' : 'stroke-rose-400';
  const glowColor =
    score >= 85 ? 'drop-shadow(0 0 4px rgba(52,211,153,0.4))' : score >= 65 ? 'drop-shadow(0 0 4px rgba(251,191,36,0.4))' : 'drop-shadow(0 0 4px rgba(251,113,133,0.4))';

  return (
    <svg width={size} height={size} className="transform -rotate-90" style={{ filter: glowColor }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-muted/30"
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
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
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

function daysUntilEvent(dateStr: string): number | null {
  try {
    const eventDate = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  } catch {
    return null;
  }
}

/** Mini stat card for the portfolio stats bar */
function StatCard({ icon, value, label, accentGradient }: { icon: React.ReactNode; value: React.ReactNode; label: string; accentGradient: string }) {
  return (
    <Card className="group relative overflow-hidden border-border/40 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl hover:border-border/70 transition-all duration-300 hover:shadow-lg hover:shadow-black/5">
      {/* Subtle ambient glow */}
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-[0.07] bg-gradient-to-br ${accentGradient}`} />
      <CardContent className="relative p-5">
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accentGradient} flex items-center justify-center ring-1 ring-white/5`}>
            {icon}
          </div>
          <div>
            <p className="text-2xl font-bold font-mono tracking-tight text-foreground">{value}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EventsHome() {
  const events = useEventStore((s) => s.events);
  const guests = useEventStore((s) => s.guests);
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);
  const addEvent = useEventStore((s) => s.addEvent);
  const addVersion = useEventStore((s) => s.addVersion);
  const [search, setSearch] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleDuplicateEvent = useCallback((event: AppEvent, e: React.MouseEvent) => {
    e.preventDefault(); // prevent Link navigation
    e.stopPropagation();

    const now = new Date().toISOString();
    const newEventId = crypto.randomUUID();
    const newVersionId = crypto.randomUUID();

    const duplicated: AppEvent = {
      ...event,
      id: newEventId,
      name: `${event.name} (Copy)`,
      status: 'planning',
      activeVersionId: newVersionId,
      createdAt: now,
      updatedAt: now,
    };

    const defaultVersion: EventVersion = {
      id: newVersionId,
      eventId: newEventId,
      name: 'Version 1',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user',
      notes: `Duplicated from "${event.name}"`,
    };

    addEvent(duplicated);
    addVersion(defaultVersion);
    navigate(`/events/${newEventId}`);
  }, [addEvent, addVersion, navigate]);

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
      <div className="min-h-screen flex flex-col">
        {/* Ambient background glow */}
        <div className="fixed inset-0 -z-10">
          <div className="absolute top-1/4 left-1/3 w-[600px] h-[600px] bg-primary/[0.03] rounded-full blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/3 w-[500px] h-[500px] bg-purple-500/[0.03] rounded-full blur-[100px]" />
        </div>

        <div className="flex flex-col items-center justify-center flex-1 text-center px-4">
          {/* Layered illustration cluster */}
          <div className="relative mb-10">
            {/* Main icon */}
            <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent flex items-center justify-center ring-1 ring-primary/10 shadow-2xl shadow-primary/10">
              <Calendar className="w-14 h-14 text-primary/70" />
            </div>
            {/* Floating accent icons */}
            <div className="absolute -top-3 -right-4 w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/25 to-purple-500/5 flex items-center justify-center ring-1 ring-purple-500/10 shadow-lg animate-pulse">
              <Users className="w-5 h-5 text-purple-400/80" />
            </div>
            <div className="absolute -bottom-3 -left-4 w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/25 to-amber-500/5 flex items-center justify-center ring-1 ring-amber-500/10 shadow-lg animate-pulse [animation-delay:0.5s]">
              <Grid3X3 className="w-5 h-5 text-amber-400/80" />
            </div>
            <div className="absolute top-1/2 -right-8 w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center ring-1 ring-emerald-500/10 animate-pulse [animation-delay:1s]">
              <Sparkles className="w-4 h-4 text-emerald-400/70" />
            </div>
          </div>

          <h2 className="text-3xl font-bold text-foreground mb-3">
            Welcome to{' '}
            <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              Event Intelligence Hub
            </span>
          </h2>
          <p className="text-muted-foreground max-w-md mb-10 text-base leading-relaxed">
            Create your first event to start planning seating, managing guests,
            and tracking readiness -- all in one intelligent platform.
          </p>

          <Button
            size="lg"
            onClick={() => setCreateModalOpen(true)}
            className="gap-2.5 h-12 px-8 text-base bg-gradient-to-r from-primary via-primary to-purple-600 shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.03] transition-all duration-300"
          >
            <Plus className="w-5 h-5" />
            Create your first event
          </Button>

          <EventCreateModal open={createModalOpen} onOpenChange={setCreateModalOpen} />

          {/* Subtle feature hints */}
          <div className="flex items-center gap-8 mt-14 text-xs text-muted-foreground/60">
            <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Smart seating</span>
            <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Guest management</span>
            <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Readiness tracking</span>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Main layout ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen">
      {/* ── Hero Section ────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border/40">
        {/* Multi-layer background effects */}
        <div className="absolute inset-0">
          {/* Dot-grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          {/* Gradient mesh blobs */}
          <div className="absolute -top-20 left-1/4 w-[500px] h-[500px] bg-primary/[0.06] rounded-full blur-[100px]" />
          <div className="absolute -bottom-20 right-1/4 w-[400px] h-[400px] bg-purple-500/[0.05] rounded-full blur-[100px]" />
          <div className="absolute top-1/2 right-1/3 w-[300px] h-[300px] bg-violet-500/[0.03] rounded-full blur-[80px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pt-6 md:pt-10 pb-6 md:pb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
            <div className="space-y-3 sm:space-y-4">
              {/* Eyebrow label */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.3em] text-primary/80 font-semibold">
                  <div className="w-5 h-5 rounded-md bg-primary/15 flex items-center justify-center">
                    <Zap className="w-3 h-3 text-primary" />
                  </div>
                  Portfolio Overview
                </div>
              </div>

              {/* Main title */}
              <div>
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.1]">
                  <span className="bg-gradient-to-r from-foreground via-foreground/90 to-foreground/60 bg-clip-text text-transparent">
                    Event Intelligence
                  </span>
                  <br />
                  <span className="bg-gradient-to-r from-primary via-purple-400 to-violet-400 bg-clip-text text-transparent">
                    Hub
                  </span>
                </h1>
              </div>

              <p className="text-sm sm:text-base text-muted-foreground max-w-lg leading-relaxed">
                Intelligent event planning, seating &amp; logistics.
                <span className="text-foreground/50"> Monitor readiness, guest pressure, and layout health across your entire portfolio.</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                size="lg"
                onClick={() => setCreateModalOpen(true)}
                className="gap-2.5 h-12 px-7 bg-gradient-to-r from-primary via-primary to-purple-600 shadow-xl shadow-primary/20 hover:shadow-primary/35 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 ring-1 ring-white/10"
              >
                <Plus className="w-4 h-4" />
                Create Event
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8 space-y-6 md:space-y-8">
        {/* ── Quick Stats Bar ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            icon={<Calendar className="w-5 h-5 text-primary" />}
            value={filtered.length}
            label="Total Events"
            accentGradient="from-primary/15 to-primary/5"
          />
          <StatCard
            icon={<Users className="w-5 h-5 text-purple-400" />}
            value={totalGuests.toLocaleString()}
            label="Total Guests"
            accentGradient="from-purple-500/15 to-purple-500/5"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5 text-amber-400" />}
            value={<>{avgReadiness}<span className="text-sm text-muted-foreground font-normal">%</span></>}
            label="Avg Readiness"
            accentGradient="from-amber-500/15 to-amber-500/5"
          />
          <StatCard
            icon={<CalendarCheck className="w-5 h-5 text-emerald-400" />}
            value={upcomingCount}
            label="Upcoming"
            accentGradient="from-emerald-500/15 to-emerald-500/5"
          />
        </div>

        {/* ── Search & Filter Bar ────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <Input
              placeholder="Search events or venues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11 bg-card/60 border-border/50 backdrop-blur-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            />
          </div>
          {search && (
            <p className="text-sm text-muted-foreground">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* ── No search results ──────────────────────────────────── */}
        {filtered.length === 0 && events.length > 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
              <Search className="w-7 h-7 text-muted-foreground/30" />
            </div>
            <p className="text-muted-foreground text-lg font-medium">No events match your search</p>
            <p className="text-muted-foreground/60 text-sm mt-1">Try a different keyword or clear the search</p>
          </div>
        )}

        {/* ── Event Cards Grid ──────────────────────────────────── */}
        <div className="grid gap-4 md:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ event, analytics }) => {
            const seatingCoverage = analytics.confirmedGuests.length > 0
              ? Math.round((analytics.assignedConfirmed / analytics.confirmedGuests.length) * 100)
              : 0;
            const topInsight = analytics.insights[0];
            const days = daysUntilEvent(event.date);
            const isUpcoming = days !== null && days >= 0;
            const isSoon = days !== null && days >= 0 && days <= 14;
            const vipCount = analytics.vipGuests.length;

            return (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-xl"
              >
                <Card className="relative overflow-hidden border-border/40 bg-gradient-to-br from-card/95 to-card/70 backdrop-blur-xl hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/[0.08] hover:scale-[1.02] active:scale-[0.995] transition-all duration-300 ease-out h-full">
                  {/* Colored accent bar - thicker for visual impact */}
                  <div className={`h-1.5 bg-gradient-to-r ${typeAccentColors[event.type] || typeAccentColors.other}`} />

                  {/* Subtle background glow matching event type */}
                  <div className={`absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-[0.04] ${typeAccentSolid[event.type] || typeAccentSolid.other}`} />

                  <CardContent className="relative p-5 space-y-4">
                    {/* Header row: badges + title */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant="outline" className={`${statusColors[event.status]} text-[11px] font-semibold px-2.5 py-0.5 border`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${statusDot[event.status]}`} />
                            {event.status}
                          </Badge>
                          <Badge variant="outline" className={`text-[11px] font-medium border-transparent px-2.5 py-0.5 ${typeAccentBg[event.type] || typeAccentBg.other}`}>
                            {typeLabels[event.type]}
                          </Badge>
                          {isSoon && (
                            <Badge variant="outline" className="text-[11px] font-medium border-amber-500/30 bg-amber-500/10 text-amber-300 px-2 py-0.5 animate-pulse">
                              {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d away`}
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors duration-200 truncate leading-tight">
                          {event.name}
                        </h3>
                      </div>
                      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-muted/30 group-hover:bg-primary/10 flex items-center justify-center transition-all duration-300">
                        <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-300" />
                      </div>
                    </div>

                    {/* Meta row: date, time, venue */}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/60" />
                        <span className="text-xs font-medium">{formatEventDate(event.date)}</span>
                      </span>
                      {event.time && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/60" />
                          <span className="text-xs font-medium">{event.time}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/60" />
                        <span className="text-xs font-medium truncate">{event.venue}</span>
                      </span>
                    </div>

                    {/* Stats row with readiness ring + key metrics */}
                    <div className="flex items-center gap-5 pt-1">
                      {/* Readiness ring */}
                      <div className="relative flex-shrink-0">
                        <ReadinessRing score={analytics.readinessScore} size={64} strokeWidth={5} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-base font-extrabold font-mono text-foreground leading-none">{analytics.readinessScore}</span>
                          <span className="text-[8px] uppercase text-muted-foreground/70 tracking-wider font-medium">Ready</span>
                        </div>
                      </div>

                      {/* Key stats grid */}
                      <div className="flex-1 grid grid-cols-3 gap-3">
                        <div className="text-center">
                          <p className="text-xl font-extrabold font-mono text-foreground leading-tight">
                            {analytics.eventGuests.length}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Guests</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-extrabold font-mono text-foreground leading-tight">
                            {seatingCoverage}<span className="text-xs text-muted-foreground font-normal">%</span>
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Seated</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-extrabold font-mono text-foreground leading-tight">
                            {analytics.tables.length}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Tables</p>
                        </div>
                      </div>
                    </div>

                    {/* VIP indicator */}
                    {vipCount > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
                        <Crown className="w-3.5 h-3.5" />
                        <span className="font-medium">{vipCount} VIP guest{vipCount !== 1 ? 's' : ''}</span>
                      </div>
                    )}

                    {/* Seating progress bar */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
                        <span className="font-medium">{analytics.assignedConfirmed} of {analytics.confirmedGuests.length} confirmed seated</span>
                        <span className="font-mono font-semibold text-foreground/60">{seatingCoverage}%</span>
                      </div>
                      <div className="h-2 bg-muted/30 rounded-full overflow-hidden ring-1 ring-white/5">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${typeAccentColors[event.type] || typeAccentColors.other} transition-all duration-700 ease-out relative`}
                          style={{ width: `${Math.min(seatingCoverage, 100)}%` }}
                        >
                          {/* Shimmer effect on progress bar */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />
                        </div>
                      </div>
                    </div>

                    {/* Top insight */}
                    {topInsight && (
                      <div className="flex items-start gap-2.5 text-xs rounded-lg bg-muted/20 border border-border/30 px-3 py-2.5">
                        {topInsight.severity === 'critical' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />}
                        {topInsight.severity === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />}
                        {topInsight.severity === 'success' && <Sparkles className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />}
                        {topInsight.severity === 'info' && <Clock3 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />}
                        <span className="text-muted-foreground leading-snug">{topInsight.title}</span>
                      </div>
                    )}

                    {/* Footer action hint */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-transparent group-hover:text-primary transition-all duration-300">
                        <span>Open event dashboard</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleDuplicateEvent(event, e)}
                          className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-primary font-medium opacity-0 group-hover:opacity-100 transition-all duration-200 rounded px-1.5 py-0.5 hover:bg-primary/10"
                          title="Duplicate event"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Duplicate</span>
                        </button>
                        {isUpcoming && days !== null && days > 14 && (
                          <span className="text-[10px] text-muted-foreground/50 font-medium">{days} days away</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <EventCreateModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
    </div>
  );
}
