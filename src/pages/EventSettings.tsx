import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save, UserPlus, Users, Shield, Eye, Trash2, Database, Download } from 'lucide-react';
import { useState } from 'react';
import { InviteCollaboratorDialog } from '@/components/InviteCollaboratorDialog';
import { toast } from 'sonner';
import type { CollaboratorRole } from '@/types/events';

const roleBadgeColors: Record<CollaboratorRole, string> = {
  owner: 'bg-primary/15 text-primary border-primary/30',
  coordinator: 'bg-accent/15 text-accent border-accent/30',
  'co-host': 'bg-info/15 text-info border-info/30',
  viewer: 'bg-muted text-muted-foreground border-border',
};

const roleLabels: Record<CollaboratorRole, string> = {
  owner: 'Owner',
  coordinator: 'Coordinator',
  'co-host': 'Co-host',
  viewer: 'Viewer',
};

export default function EventSettings() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const updateEvent = useEventStore((s) => s.updateEvent);
  const userProfile = useEventStore((s) => s.userProfile);
  const getEventCollaborators = useEventStore((s) => s.getEventCollaborators);
  const removeCollaborator = useEventStore((s) => s.removeCollaborator);
  const event = events.find((e) => e.id === eventId);
  const collaborators = eventId ? getEventCollaborators(eventId) : [];

  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState(event?.name ?? '');
  const [date, setDate] = useState(event?.date ?? '');
  const [time, setTime] = useState(event?.time ?? '');
  const [venue, setVenue] = useState(event?.venue ?? '');
  const [venueAddress, setVenueAddress] = useState(event?.venueAddress ?? '');

  if (!event) return <div className="p-8 text-muted-foreground">Event not found</div>;

  const hasChanges =
    name !== event.name ||
    date !== event.date ||
    time !== event.time ||
    venue !== event.venue ||
    venueAddress !== event.venueAddress;

  function handleSave() {
    if (!eventId || !hasChanges) return;
    try {
      updateEvent(eventId, { name, date, time, venue, venueAddress });
      toast.success('Event settings saved!');
    } catch {
      toast.error('Failed to save event settings');
    }
  }

  function handleExportGuestCSV() {
    const guests = useEventStore.getState().guests.filter((g) => g.eventId === eventId);
    if (guests.length === 0) {
      toast.error('No guests to export');
      return;
    }
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Organization', 'Category', 'RSVP Status', 'Party Size', 'Dietary Restrictions', 'Notes'];
    const rows = guests.map((g) => [
      g.firstName, g.lastName, g.email, g.phone, g.organization,
      g.category, g.rsvpStatus, String(g.partySize), g.dietaryRestrictions, g.notes,
    ].map((v) => `"${(v ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.name.replace(/\s+/g, '-')}-guests.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${guests.length} guests`);
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Event configuration and preferences</p>
        </div>
        <Button size="sm" className="gap-2" onClick={handleSave} disabled={!hasChanges}>
          <Save className="w-4 h-4" />Save Changes
        </Button>
      </div>

      <div className="space-y-8">
        {/* Event Details */}
        <section className="glass-panel p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Event Details</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Event Name</label>
              <Input className="mt-1 bg-muted border-border" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <Input className="mt-1 bg-muted border-border font-mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Time</label>
                <Input className="mt-1 bg-muted border-border font-mono" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Venue</label>
              <Input className="mt-1 bg-muted border-border" value={venue} onChange={(e) => setVenue(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Venue Address</label>
              <Input className="mt-1 bg-muted border-border" value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
            </div>
          </div>
        </section>

        {/* Team & Collaborators */}
        <section className="glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Team & Collaborators</h3>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowInvite(true)}>
              <UserPlus className="w-3.5 h-3.5" />
              Invite
            </Button>
          </div>

          <div className="space-y-2">
            {/* Owner */}
            {userProfile && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {userProfile.firstName.charAt(0)}{userProfile.lastName.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{userProfile.firstName} {userProfile.lastName}</p>
                  <p className="text-xs text-muted-foreground truncate">{userProfile.email}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${roleBadgeColors.owner}`}>
                  Owner
                </span>
              </div>
            )}

            {/* Collaborators */}
            {collaborators.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-muted-foreground">
                    {c.name.split(' ').map((n) => n.charAt(0)).join('').slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${roleBadgeColors[c.role]}`}>
                  {roleLabels[c.role]}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.status === 'pending' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>
                  {c.status}
                </span>
                <button
                  onClick={() => { if (window.confirm('Remove this collaborator?')) removeCollaborator(c.id); }}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {collaborators.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                No collaborators yet. Invite coordinators, co-hosts, or viewers to help plan this event.
              </p>
            )}
          </div>
        </section>

        {/* Export */}
        <section className="glass-panel p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Export</h3>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={handleExportGuestCSV}>Export Guest List (CSV)</Button>
            <Button variant="outline" size="sm" disabled title="PDF export coming soon">Export Seating Chart (PDF)</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>Print Layout</Button>
          </div>
        </section>

        {/* Default Seating Rules */}
        <section className="glass-panel p-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">Default Seating Rules</h3>
          <p className="text-sm text-muted-foreground">Configure default seating rules for new versions. Rules can be adjusted per-version in the Seating Planner.</p>
        </section>

        {/* Test Data — only visible in development mode */}
        {import.meta.env.DEV && (
          <section className="glass-panel p-6">
            <h3 className="text-sm font-semibold text-foreground mb-2">Test Data (Dev Only)</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Load scholarship ceremony test data: 18 donors and 100 scholarship recipients
              with relationship groups. Use the CSV import on the Guests page to load the second batch of 100.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  useEventStore.getState().loadScholarshipSeedData('first');
                  toast.success('Loaded 18 donors + 100 recipients with relationship groups!');
                }}
              >
                <Database className="w-3.5 h-3.5" />
                Load First Half (118 guests)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = '/scholarship-recipients-batch2.csv';
                  link.download = 'scholarship-recipients-batch2.csv';
                  link.click();
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV (100 more)
              </Button>
            </div>
          </section>
        )}

        {/* Branding */}
        <section className="glass-panel p-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">Branding</h3>
          <p className="text-sm text-muted-foreground">Custom logos, colors, and branding for printed materials and exports will be available soon.</p>
        </section>
      </div>

      <InviteCollaboratorDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        eventId={eventId!}
      />
    </div>
  );
}
