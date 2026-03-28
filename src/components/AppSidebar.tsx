import { NavLink, useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar, LayoutGrid, Users, Grid3X3, GitBranch,
  Plug, Settings, BarChart3, ChevronLeft, Sprout, Layers, Sun, Moon, Building2, ChevronDown, Check, Plus, LogOut
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEventStore } from '@/data/store';
import { useAuthContext } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';
import { CreateOrgDialog } from './CreateOrgDialog';

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

interface AppSidebarProps {
  showInspector?: boolean;
  onToggleInspector?: () => void;
}

export function AppSidebar({ showInspector, onToggleInspector }: AppSidebarProps) {
  const { eventId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { user: authUser, signOut: authSignOut } = useAuthContext();
  const userProfile = useEventStore((s) => s.userProfile);
  const organizations = useEventStore((s) => s.organizations);
  const activeOrgId = useEventStore((s) => s.activeOrgId);
  const setActiveOrg = useEventStore((s) => s.setActiveOrg);
  const events = useEventStore((s) => s.events);
  const activeOrg = organizations.find((o) => o.id === activeOrgId);
  const currentEvent = events.find((e) => e.id === eventId);
  const isLayoutPage = location.pathname.endsWith('/layout');
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <aside className="w-60 min-h-screen border-r border-sidebar-border flex flex-col relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-sidebar" />
      <div
        className="absolute inset-0 opacity-[0.08] dark:opacity-[0.07] pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, hsl(152 55% 48%) 0%, hsl(130 45% 42%) 40%, transparent 100%)',
        }}
      />

      {/* Brand */}
      <div className="relative h-14 flex items-center px-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, hsl(152 68% 42%), hsl(84 60% 48%))',
            }}
          >
            <Sprout className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-foreground tracking-tight text-sm">Grad Roots</span>
            <span className="text-[10px] text-muted-foreground ml-1.5 font-medium">EventMap</span>
          </div>
        </div>
      </div>

      {/* Org Switcher */}
      <div className="relative px-3 pt-3" ref={dropdownRef}>
        <button
          onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm bg-sidebar-accent/60 hover:bg-sidebar-accent transition-colors"
        >
          <Building2 className="w-4 h-4 text-primary shrink-0" />
          <span className="flex-1 text-left font-medium text-foreground truncate">
            {activeOrg?.name ?? 'Select organization'}
          </span>
          <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', orgDropdownOpen && 'rotate-180')} />
        </button>
        {orgDropdownOpen && (
          <div className="absolute left-3 right-3 mt-1 z-50 rounded-md border border-sidebar-border bg-sidebar shadow-lg py-1">
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => {
                  setActiveOrg(org.id);
                  setOrgDropdownOpen(false);
                  // Navigate home when switching orgs so user sees that org's events
                  if (eventId) navigate('/');
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent/50',
                  org.id === activeOrgId && 'bg-sidebar-accent'
                )}
              >
                <div
                  className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ background: org.primaryColor || 'hsl(152 55% 48%)' }}
                >
                  {org.shortName.charAt(0)}
                </div>
                <span className="flex-1 text-left truncate text-sidebar-foreground">{org.name}</span>
                {org.id === activeOrgId && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </button>
            ))}
            <div className="border-t border-sidebar-border mt-1 pt-1">
              <button
                onClick={() => {
                  setOrgDropdownOpen(false);
                  setShowCreateOrg(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent/50 text-muted-foreground"
              >
                <Plus className="w-4 h-4" />
                <span>Add organization</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <nav className="relative flex-1 py-3 px-3 space-y-1 overflow-y-auto">
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

            {/* Layout tools section — only on layout page */}
            {isLayoutPage && onToggleInspector && (
              <div className="mt-4 pt-4 border-t border-sidebar-border space-y-0.5">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Layout Tools</p>
                <button
                  onClick={onToggleInspector}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors w-full',
                    showInspector
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Layers className="w-4 h-4" />
                  Inspector Panel
                </button>
              </div>
            )}
          </>
        )}
      </nav>

      {/* Footer with profile + sign out */}
      <div className="relative p-4 border-t border-sidebar-border space-y-3">
        {authUser && (
          <div className="flex items-center gap-2.5 px-1 py-1">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">
                {(authUser.user_metadata.first_name ?? '').charAt(0)}{(authUser.user_metadata.last_name ?? '').charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{authUser.user_metadata.first_name ?? ''} {authUser.user_metadata.last_name ?? ''}</p>
              <p className="text-[10px] text-muted-foreground truncate">{authUser.email}</p>
            </div>
            <button
              onClick={() => { authSignOut(); navigate('/sign-in'); }}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            <span className="font-semibold">Grad Roots</span> EventMap v0.1
          </p>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <CreateOrgDialog open={showCreateOrg} onOpenChange={setShowCreateOrg} />
    </aside>
  );
}
