import { NavLink, useParams } from 'react-router-dom';
import { 
  Calendar, LayoutGrid, Users, Grid3X3, GitBranch, 
  Plug, Settings, BarChart3, ChevronLeft, MapPin 
} from 'lucide-react';
import { useEventStore } from '@/data/store';
import { cn } from '@/lib/utils';

const globalNav = [
  { label: 'Events', icon: Calendar, path: '/' },
];

const eventNav = [
  { label: 'Dashboard', icon: BarChart3, path: '' },
  { label: 'Layout', icon: LayoutGrid, path: '/layout' },
  { label: 'Guests', icon: Users, path: '/guests' },
  { label: 'Seating', icon: Grid3X3, path: '/seating' },
  { label: 'Versions', icon: GitBranch, path: '/versions' },
  { label: 'Integrations', icon: Plug, path: '/integrations' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

export function AppSidebar() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const currentEvent = events.find((e) => e.id === eventId);

  return (
    <aside className="w-60 min-h-screen border-r border-border bg-sidebar flex flex-col">
      {/* Brand */}
      <div className="h-14 flex items-center px-5 border-b border-border">
        <MapPin className="w-5 h-5 text-primary mr-2" />
        <span className="font-semibold text-foreground tracking-tight text-sm">EventMap HQ</span>
      </div>

      <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
        {/* Global nav */}
        {globalNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}

        {/* Event context */}
        {currentEvent && (
          <>
            <div className="pt-4 pb-2 px-3">
              <NavLink to="/" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2">
                <ChevronLeft className="w-3 h-3" />
                All Events
              </NavLink>
              <p className="text-xs font-semibold text-foreground truncate">{currentEvent.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{currentEvent.date}</p>
            </div>

            <div className="space-y-0.5">
              {eventNav.map((item) => (
                <NavLink
                  key={item.path}
                  to={`/events/${eventId}${item.path}`}
                  end={item.path === ''}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                    )
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground">EventMap HQ v0.1</p>
      </div>
    </aside>
  );
}
