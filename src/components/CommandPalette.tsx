import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
  CommandSeparator,
} from '@/components/ui/command';
import { useEventStore } from '@/data/store';
import {
  Calendar,
  LayoutDashboard,
  Grid3X3,
  Users,
  Armchair,
  GitBranch,
  Plus,
  UserPlus,
  Grid2X2,
  Search,
  Plug,
  Settings,
} from 'lucide-react';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const guests = useEventStore((s) => s.guests);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const runCommand = useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    []
  );

  const currentEventPages = eventId
    ? [
        { label: 'Dashboard', icon: LayoutDashboard, path: `/events/${eventId}` },
        { label: 'Layout Editor', icon: Grid3X3, path: `/events/${eventId}/layout` },
        { label: 'Guest List', icon: Users, path: `/events/${eventId}/guests` },
        { label: 'Seating', icon: Armchair, path: `/events/${eventId}/seating` },
        { label: 'Versions', icon: GitBranch, path: `/events/${eventId}/versions` },
        { label: 'Integrations', icon: Plug, path: `/events/${eventId}/integrations` },
        { label: 'Settings', icon: Settings, path: `/events/${eventId}/settings` },
      ]
    : [];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Events */}
        <CommandGroup heading="Events">
          {events.map((event) => (
            <CommandItem
              key={event.id}
              value={`event-${event.name}`}
              onSelect={() => runCommand(() => navigate(`/events/${event.id}`))}
            >
              <Calendar className="mr-2 h-4 w-4 shrink-0" />
              <div className="flex flex-col">
                <span>{event.name}</span>
                <span className="text-xs text-muted-foreground">
                  {event.venue} &middot; {event.date}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Pages (current event) */}
        {currentEventPages.length > 0 && (
          <>
            <CommandGroup heading="Pages">
              {currentEventPages.map((page) => (
                <CommandItem
                  key={page.path}
                  value={`page-${page.label}`}
                  onSelect={() => runCommand(() => navigate(page.path))}
                >
                  <page.icon className="mr-2 h-4 w-4 shrink-0" />
                  <span>{page.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Actions */}
        <CommandGroup heading="Actions">
          <CommandItem
            value="action-create-new-event"
            onSelect={() => runCommand(() => navigate('/'))}
          >
            <Plus className="mr-2 h-4 w-4 shrink-0" />
            <div className="flex flex-col">
              <span>Create new event</span>
              <span className="text-xs text-muted-foreground">Go to events page to create</span>
            </div>
          </CommandItem>
          {eventId && (
            <>
              <CommandItem
                value="action-add-guest"
                onSelect={() => runCommand(() => navigate(`/events/${eventId}/guests`))}
              >
                <UserPlus className="mr-2 h-4 w-4 shrink-0" />
                <div className="flex flex-col">
                  <span>Add guest</span>
                  <span className="text-xs text-muted-foreground">Navigate to guest list</span>
                </div>
              </CommandItem>
              <CommandItem
                value="action-toggle-grid"
                onSelect={() => runCommand(() => navigate(`/events/${eventId}/layout`))}
              >
                <Grid2X2 className="mr-2 h-4 w-4 shrink-0" />
                <div className="flex flex-col">
                  <span>Toggle grid</span>
                  <span className="text-xs text-muted-foreground">Open layout editor</span>
                </div>
              </CommandItem>
            </>
          )}
        </CommandGroup>

        <CommandSeparator />

        {/* Search guests */}
        <CommandGroup heading="Search Guests">
          {guests.map((guest) => {
            const guestEvent = events.find((e) => e.id === guest.eventId);
            return (
              <CommandItem
                key={guest.id}
                value={`guest-${guest.firstName} ${guest.lastName} ${guest.displayName} ${guest.email}`}
                onSelect={() =>
                  runCommand(() => navigate(`/events/${guest.eventId}/guests`))
                }
              >
                <Search className="mr-2 h-4 w-4 shrink-0" />
                <div className="flex flex-col">
                  <span>{guest.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {guestEvent?.name ?? 'Unknown event'} &middot; {guest.category}
                  </span>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
