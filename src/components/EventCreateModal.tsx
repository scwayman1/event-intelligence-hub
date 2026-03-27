import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { AppEvent, EventType, EventVersion } from '@/types/events';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Clock, MapPin, Users, Sparkles } from 'lucide-react';

const eventTypes: { value: EventType; label: string }[] = [
  { value: 'ceremony', label: 'Ceremony' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'gala', label: 'Gala' },
  { value: 'reception', label: 'Reception' },
  { value: 'banquet', label: 'Banquet' },
  { value: 'commencement', label: 'Commencement' },
  { value: 'other', label: 'Other' },
];

interface EventCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const initialForm = {
  name: '',
  type: '' as EventType | '',
  date: '',
  time: '',
  venue: '',
  venueAddress: '',
  estimatedAttendance: '',
  notes: '',
};

export default function EventCreateModal({ open, onOpenChange }: EventCreateModalProps) {
  const navigate = useNavigate();
  const addEvent = useEventStore((s) => s.addEvent);
  const addVersion = useEventStore((s) => s.addVersion);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function resetForm() {
    setForm(initialForm);
    setErrors({});
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = 'Event name is required';
    if (!form.type) newErrors.type = 'Event type is required';
    if (!form.date) newErrors.date = 'Date is required';
    if (!form.venue.trim()) newErrors.venue = 'Venue is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const now = new Date().toISOString();
    const eventId = crypto.randomUUID();
    const versionId = crypto.randomUUID();

    const newEvent: AppEvent = {
      id: eventId,
      name: form.name.trim(),
      type: form.type as EventType,
      status: 'planning',
      date: form.date,
      time: form.time,
      venue: form.venue.trim(),
      venueAddress: form.venueAddress.trim(),
      estimatedAttendance: form.estimatedAttendance ? parseInt(form.estimatedAttendance, 10) : 0,
      notes: form.notes.trim(),
      activeVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    };

    const defaultVersion: EventVersion = {
      id: versionId,
      eventId,
      name: 'Version 1',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user',
      notes: 'Initial version',
    };

    addEvent(newEvent);
    addVersion(defaultVersion);
    resetForm();
    onOpenChange(false);
    navigate(`/events/${eventId}`);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-gradient-to-br from-card to-card/95 border-border/50 backdrop-blur-xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center ring-1 ring-primary/10">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Create New Event</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Set up your event details to get started with planning.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Event Name */}
          <div className="space-y-2">
            <Label htmlFor="event-name" className="text-sm font-medium">
              Event Name <span className="text-rose-400">*</span>
            </Label>
            <Input
              id="event-name"
              placeholder="e.g. Annual Charity Gala 2026"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-11 bg-background/50 border-border/50 focus:border-primary/50"
            />
            {errors.name && <p className="text-xs text-rose-400">{errors.name}</p>}
          </div>

          {/* Type & Date row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Event Type <span className="text-rose-400">*</span>
              </Label>
              <Select
                value={form.type}
                onValueChange={(val) => setForm((f) => ({ ...f, type: val as EventType }))}
              >
                <SelectTrigger className="h-11 bg-background/50 border-border/50">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && <p className="text-xs text-rose-400">{errors.type}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-date" className="text-sm font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                Date <span className="text-rose-400">*</span>
              </Label>
              <Input
                id="event-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="h-11 bg-background/50 border-border/50 focus:border-primary/50"
              />
              {errors.date && <p className="text-xs text-rose-400">{errors.date}</p>}
            </div>
          </div>

          {/* Time & Estimated Attendance row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event-time" className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Time
              </Label>
              <Input
                id="event-time"
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                className="h-11 bg-background/50 border-border/50 focus:border-primary/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-attendance" className="text-sm font-medium flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                Estimated Attendance
              </Label>
              <Input
                id="event-attendance"
                type="number"
                min={0}
                placeholder="e.g. 200"
                value={form.estimatedAttendance}
                onChange={(e) => setForm((f) => ({ ...f, estimatedAttendance: e.target.value }))}
                className="h-11 bg-background/50 border-border/50 focus:border-primary/50"
              />
            </div>
          </div>

          {/* Venue */}
          <div className="space-y-2">
            <Label htmlFor="event-venue" className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              Venue <span className="text-rose-400">*</span>
            </Label>
            <Input
              id="event-venue"
              placeholder="e.g. Grand Ballroom at The Ritz"
              value={form.venue}
              onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
              className="h-11 bg-background/50 border-border/50 focus:border-primary/50"
            />
            {errors.venue && <p className="text-xs text-rose-400">{errors.venue}</p>}
          </div>

          {/* Venue Address */}
          <div className="space-y-2">
            <Label htmlFor="event-address" className="text-sm font-medium">
              Venue Address
            </Label>
            <Input
              id="event-address"
              placeholder="e.g. 123 Main St, New York, NY 10001"
              value={form.venueAddress}
              onChange={(e) => setForm((f) => ({ ...f, venueAddress: e.target.value }))}
              className="h-11 bg-background/50 border-border/50 focus:border-primary/50"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="event-notes" className="text-sm font-medium">
              Notes
            </Label>
            <Textarea
              id="event-notes"
              placeholder="Any additional details or planning notes..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="min-h-[80px] bg-background/50 border-border/50 focus:border-primary/50 resize-none"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="px-6"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!form.name.trim() || !form.type || !form.date || !form.venue.trim()}
              className="gap-2 px-8 bg-gradient-to-r from-primary via-primary to-purple-600 shadow-lg shadow-primary/20 hover:shadow-primary/35 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              Create Event
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
