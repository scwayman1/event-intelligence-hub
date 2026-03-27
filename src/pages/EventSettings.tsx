import { useState } from 'react';
import { toast } from 'sonner';
import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import PageHeader from '@/components/PageHeader';
import { Save, Building2, Calendar, Clock, MapPin, Users, FileText, Download, Printer, Info } from 'lucide-react';
import { EventNotFound } from '@/components/EventNotFound';

export default function EventSettings() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const updateEvent = useEventStore((s) => s.updateEvent);
  const event = events.find((e) => e.id === eventId);

  const [form, setForm] = useState(() =>
    event
      ? {
          name: event.name,
          date: event.date,
          time: event.time,
          venue: event.venue,
          venueAddress: event.venueAddress,
          estimatedAttendance: event.estimatedAttendance,
          notes: event.notes,
          type: event.type,
        }
      : null,
  );

  if (!event || !form) {
    return <EventNotFound />;
  }

  const update = (field: string, value: string | number) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSave = () => {
    if (!eventId || !form) return;
    updateEvent(eventId, {
      ...form,
      updatedAt: new Date().toISOString(),
    });
    toast.success('Settings saved');
  };

  const createdDate = new Date(event.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const updatedDate = new Date(event.updatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="p-8 max-w-3xl animate-fade-in">
      <PageHeader
        title="Settings"
        description="Event configuration and preferences"
        actions={
          <Button size="sm" className="gap-2" onClick={handleSave}>
            <Save className="w-4 h-4" />
            Save Changes
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Event Details */}
        <section className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Event Details</h3>
              <p className="text-xs text-muted-foreground">Core information about your event</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Name</label>
              <Input
                className="mt-1.5 bg-muted/50 border-border focus:bg-muted"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> Date
                </label>
                <Input
                  className="mt-1.5 bg-muted/50 border-border font-mono text-sm focus:bg-muted"
                  value={form.date}
                  onChange={(e) => update('date', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Time
                </label>
                <Input
                  className="mt-1.5 bg-muted/50 border-border font-mono text-sm focus:bg-muted"
                  value={form.time}
                  onChange={(e) => update('time', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Type</label>
                <Input
                  className="mt-1.5 bg-muted/50 border-border capitalize focus:bg-muted"
                  value={form.type}
                  onChange={(e) => update('type', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3 h-3" /> Est. Attendance
                </label>
                <Input
                  className="mt-1.5 bg-muted/50 border-border font-mono text-sm focus:bg-muted"
                  type="number"
                  value={form.estimatedAttendance}
                  onChange={(e) => update('estimatedAttendance', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Venue Information */}
        <section className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Venue Information</h3>
              <p className="text-xs text-muted-foreground">Location and address details</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3 h-3" /> Venue Name
              </label>
              <Input
                className="mt-1.5 bg-muted/50 border-border focus:bg-muted"
                value={form.venue}
                onChange={(e) => update('venue', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Venue Address
              </label>
              <Input
                className="mt-1.5 bg-muted/50 border-border focus:bg-muted"
                value={form.venueAddress}
                onChange={(e) => update('venueAddress', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Notes / Preferences */}
        <section className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center">
              <Info className="w-4 h-4 text-info" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Preferences</h3>
              <p className="text-xs text-muted-foreground">Notes and event-specific preferences</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Notes</label>
            <Textarea
              className="mt-1.5 bg-muted/50 border-border min-h-[100px] focus:bg-muted"
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Add any notes about special requirements, logistics, or reminders..."
            />
          </div>
        </section>

        {/* Export */}
        <section className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
              <Download className="w-4 h-4 text-success" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Export & Print</h3>
              <p className="text-xs text-muted-foreground">Download data or print materials</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-3.5 h-3.5" /> Export Guest List (CSV)
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-3.5 h-3.5" /> Export Seating Chart (PDF)
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Printer className="w-3.5 h-3.5" /> Print Layout
            </Button>
          </div>
        </section>

        {/* Seating Rules placeholder */}
        <section className="glass-panel p-6 opacity-75">
          <h3 className="text-sm font-semibold text-foreground mb-1">Default Seating Rules</h3>
          <p className="text-sm text-muted-foreground">
            Configure default seating rules for new versions. Rules can be adjusted per-version in the Seating Planner.
          </p>
        </section>

        {/* Branding placeholder */}
        <section className="glass-panel p-6 opacity-75">
          <h3 className="text-sm font-semibold text-foreground mb-1">Branding</h3>
          <p className="text-sm text-muted-foreground">
            Custom logos, colors, and branding for printed materials and exports will be available soon.
          </p>
        </section>

        {/* Metadata footer */}
        <Separator className="my-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-4">
          <span>Created {createdDate}</span>
          <span>Last updated {updatedDate}</span>
        </div>
      </div>
    </div>
  );
}
