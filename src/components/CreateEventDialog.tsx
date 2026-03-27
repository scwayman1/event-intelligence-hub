import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EventType } from '@/types/events';

const eventTypes: { value: EventType; label: string }[] = [
  { value: 'ceremony', label: 'Ceremony' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'gala', label: 'Gala' },
  { value: 'reception', label: 'Reception' },
  { value: 'banquet', label: 'Banquet' },
  { value: 'commencement', label: 'Commencement' },
  { value: 'other', label: 'Other' },
];

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEventDialog({ open, onOpenChange }: CreateEventDialogProps) {
  const navigate = useNavigate();
  const activeOrgId = useEventStore((s) => s.activeOrgId);
  const addEvent = useEventStore((s) => s.addEvent);
  const addVersion = useEventStore((s) => s.addVersion);

  const [name, setName] = useState('');
  const [type, setType] = useState<EventType>('ceremony');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [venue, setVenue] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [estimatedAttendance, setEstimatedAttendance] = useState('');

  function handleCreate() {
    if (!name.trim() || !activeOrgId) return;

    const eventId = `evt-${crypto.randomUUID().slice(0, 8)}`;
    const versionId = `ver-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    addVersion({
      id: versionId,
      eventId,
      name: 'Initial Layout',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: 'User',
      notes: 'Auto-created with event.',
    });

    addEvent({
      id: eventId,
      orgId: activeOrgId,
      name: name.trim(),
      type,
      status: 'planning',
      date: date || new Date().toISOString().split('T')[0],
      time: time || '18:00',
      venue: venue.trim(),
      venueAddress: venueAddress.trim(),
      estimatedAttendance: parseInt(estimatedAttendance) || 0,
      notes: '',
      activeVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    });

    // Reset form
    setName('');
    setType('ceremony');
    setDate('');
    setTime('18:00');
    setVenue('');
    setVenueAddress('');
    setEstimatedAttendance('');
    onOpenChange(false);

    navigate(`/events/${eventId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create event</DialogTitle>
          <DialogDescription>Set up a new event for your organization. You can edit all details later.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="evt-name">Event name</Label>
            <Input
              id="evt-name"
              placeholder="e.g. 2026 Scholarship Ceremony"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="evt-type">Type</Label>
              <select
                id="evt-type"
                value={type}
                onChange={(e) => setType(e.target.value as EventType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {eventTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="evt-attendance">Est. attendance</Label>
              <Input
                id="evt-attendance"
                type="number"
                placeholder="e.g. 200"
                value={estimatedAttendance}
                onChange={(e) => setEstimatedAttendance(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="evt-date">Date</Label>
              <Input
                id="evt-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evt-time">Time</Label>
              <Input
                id="evt-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evt-venue">Venue</Label>
            <Input
              id="evt-venue"
              placeholder="e.g. Grand Pavilion Ballroom"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evt-address">Venue address</Label>
            <Input
              id="evt-address"
              placeholder="e.g. 1200 University Blvd"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>Create event</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
