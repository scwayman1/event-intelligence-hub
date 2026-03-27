import { NavLink, useParams } from 'react-router-dom';
import {
  Sparkles,
  Calendar,
  LayoutDashboard,
  Grid3X3,
  Users,
  Armchair,
  GitBranch,
  Plug,
  Settings,
  ChevronLeft,
  CalendarDays,
  MapPin,
  Search,
} from 'lucide-react';
import { useEventStore } from '@/data/store';
import { cn } from '@/lib/utils';

const globalNav = [
  { label: 'Events', icon: Calendar, path: '/' },
];

const eventNav = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '' },
  { label: 'Layout Editor', icon: Grid3X3, path: '/layout' },
  { label: 'Guest List', icon: Users, path: '/guests' },
  { label: 'Seating', icon: Armchair, path: '/seating' },
  { label: 'Versions', icon: GitBranch, path: '/versions' },
  { label: 'Integrations', icon: Plug, path: '/integrations' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

const eventTypeLabels: Record<string, string> = {
  ceremony: 'Ceremony',
  dinner: 'Dinner',
  gala: 'Gala',
  reception: 'Reception',
  banquet: 'Banquet',
  commencement: 'Commencement',
  other: 'Event',
};

const eventTypeEmoji: Record<string, string> = {
  ceremony: '\u2728',
  dinner: '\uD83C\uDF7D\uFE0F',
  gala: '\uD83C\uDF1F',
  reception: '\uD83E\uDD42',
  banquet: '\uD83C\uDF7A',
  commencement: '\uD83C\uDF93',
  other: '\uD83D\uDCC5',
};

function SidebarLink({
  to,
  end,
  icon: Icon,
  label,
}: {
  to: string;
  end?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium',
          'transition-all duration-200 ease-out',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm shadow-black/10'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Left accent bar for active state */}
          <span
            className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-200 ease-out',
              isActive
                ? 'h-5 bg-sidebar-primary opacity-100'
                : 'h-0 bg-sidebar-primary opacity-0 group-hover:h-3 group-hover:opacity-40'
            )}
          />
          <Icon
            className={cn(
              'w-4 h-4 shrink-0 transition-all duration-200',
              isActive
                ? 'text-sidebar-primary'
                : 'text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground'
            )}
          />
          <span className="truncate">{label}</span>
          {/* Subtle right indicator for active */}
          {isActive && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sidebar-primary/60" />
          )}
        </>
      )}
    </NavLink>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40">
      {children}
    </p>
  );
}

export function AppSidebar() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const currentEvent = events.find((e) => e.id === eventId);

  return (
    <aside className="w-64 min-h-screen border-r border-sidebar-border bg-sidebar flex flex-col select-none">
      {/* Brand */}
      <div className="h-14 flex items-center gap-2.5 px-5 border-b border-sidebar-border/80">
        <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-sidebar-primary/20 to-sidebar-primary/5 ring-1 ring-sidebar-primary/20">
          <Sparkles className="w-4 h-4 text-sidebar-primary" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-sidebar-primary/80 animate-pulse" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sidebar-accent-foreground tracking-tight text-[15px] leading-tight">
            EventIQ
          </span>
          <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/40 leading-tight">
            Intelligence Hub
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-3 overflow-y-auto">
        {/* Global nav */}
        <SectionLabel>Navigation</SectionLabel>
        <div className="space-y-0.5">
          {globalNav.map((item) => (
            <SidebarLink
              key={item.path}
              to={item.path}
              end
              icon={item.icon}
              label={item.label}
            />
          ))}
        </div>

        {/* Event context section */}
        {currentEvent && (
          <>
            {/* Event context header */}
            <div className="mt-4 mx-1 rounded-lg bg-sidebar-accent/60 border border-sidebar-border/60 p-3">
              <div className="flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5">
                  {eventTypeEmoji[currentEvent.type] || '\uD83D\uDCC5'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-sidebar-accent-foreground truncate leading-tight">
                    {currentEvent.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-sidebar-primary/10 text-sidebar-primary border border-sidebar-primary/20">
                      {eventTypeLabels[currentEvent.type] || 'Event'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-sidebar-foreground/50">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {currentEvent.date}
                    </span>
                    {currentEvent.venue && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{currentEvent.venue}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Event sub-navigation */}
            <SectionLabel>Event</SectionLabel>
            <div className="space-y-0.5">
              {eventNav.map((item) => (
                <SidebarLink
                  key={item.path}
                  to={`/events/${eventId}${item.path}`}
                  end={item.path === ''}
                  icon={item.icon}
                  label={item.label}
                />
              ))}
            </div>
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-3 pt-2 border-t border-sidebar-border/60 space-y-1.5">
        {currentEvent && (
          <NavLink
            to="/"
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium',
              'text-sidebar-foreground/60 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/40',
              'transition-all duration-200 ease-out group'
            )}
          >
            <ChevronLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Back to all events
          </NavLink>
        )}
        <button
          onClick={() => {
            const event = new KeyboardEvent('keydown', {
              key: 'k',
              metaKey: true,
              bubbles: true,
            });
            document.dispatchEvent(event);
          }}
          className={cn(
            'flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[12px] font-medium',
            'text-sidebar-foreground/50 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/40',
            'transition-all duration-200 ease-out'
          )}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search & Commands</span>
          <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar-accent/60 px-1.5 font-mono text-[10px] font-medium text-sidebar-foreground/50">
            <span className="text-xs">{'\u2318'}K</span>
          </kbd>
        </button>
        <div className="flex items-center justify-between px-3 pt-1">
          <p className="text-[10px] text-sidebar-foreground/30 font-mono tracking-wide">
            v0.1.0
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
            <span className="text-[10px] text-sidebar-foreground/30">Online</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
