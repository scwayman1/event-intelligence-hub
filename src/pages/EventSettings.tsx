import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';

export default function EventSettings() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const event = events.find((e) => e.id === eventId);

  if (!event) return <div className="p-8 text-muted-foreground">Event not found</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Event configuration and preferences</p>
        </div>
        <Button size="sm" className="gap-2"><Save className="w-4 h-4" />Save Changes</Button>
      </div>

      <div className="space-y-8">
        {/* Event Details */}
        <section className="glass-panel p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Event Details</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Event Name</label>
              <Input className="mt-1 bg-muted border-border" defaultValue={event.name} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <Input className="mt-1 bg-muted border-border font-mono" defaultValue={event.date} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Time</label>
                <Input className="mt-1 bg-muted border-border font-mono" defaultValue={event.time} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Venue</label>
              <Input className="mt-1 bg-muted border-border" defaultValue={event.venue} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Venue Address</label>
              <Input className="mt-1 bg-muted border-border" defaultValue={event.venueAddress} />
            </div>
          </div>
        </section>

        {/* Permissions placeholder */}
        <section className="glass-panel p-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">Permissions</h3>
          <p className="text-sm text-muted-foreground">Team permissions and role management will be available with backend integration.</p>
        </section>

        {/* Export */}
        <section className="glass-panel p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Export Preferences</h3>
          <div className="flex gap-3">
            <Button variant="outline" size="sm">Export Guest List (CSV)</Button>
            <Button variant="outline" size="sm">Export Seating Chart (PDF)</Button>
            <Button variant="outline" size="sm">Print Layout</Button>
          </div>
        </section>

        {/* Default Seating Rules */}
        <section className="glass-panel p-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">Default Seating Rules</h3>
          <p className="text-sm text-muted-foreground">Configure default seating rules for new versions. Rules can be adjusted per-version in the Seating Planner.</p>
        </section>

        {/* Branding */}
        <section className="glass-panel p-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">Branding</h3>
          <p className="text-sm text-muted-foreground">Custom logos, colors, and branding for printed materials and exports will be available soon.</p>
        </section>
      </div>
    </div>
  );
}
