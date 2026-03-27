import { useState } from 'react';
import { useEventStore } from '@/data/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GuestCategory, RSVPStatus } from '@/types/events';

const categoryOptions: { value: GuestCategory; label: string }[] = [
  { value: 'donor', label: 'Donor' },
  { value: 'scholarship_recipient', label: 'Scholar' },
  { value: 'family', label: 'Family' },
  { value: 'board_member', label: 'Board Member' },
  { value: 'vip', label: 'VIP' },
  { value: 'staff', label: 'Staff' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'other', label: 'Other' },
];

const rsvpOptions: { value: RSVPStatus; label: string }[] = [
  { value: 'invited', label: 'Invited' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
  { value: 'waitlist', label: 'Waitlist' },
];

interface AddGuestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  orgId: string;
}

export function AddGuestDialog({ open, onOpenChange, eventId, orgId }: AddGuestDialogProps) {
  const addGuest = useEventStore((s) => s.addGuest);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [category, setCategory] = useState<GuestCategory>('other');
  const [rsvpStatus, setRsvpStatus] = useState<RSVPStatus>('invited');
  const [partySize, setPartySize] = useState('1');
  const [dietaryRestrictions, setDietaryRestrictions] = useState('');
  const [accessibilityNeeds, setAccessibilityNeeds] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setOrganization('');
    setCategory('other');
    setRsvpStatus('invited');
    setPartySize('1');
    setDietaryRestrictions('');
    setAccessibilityNeeds('');
    setNotes('');
  }

  function handleCreate() {
    if (!firstName.trim() || !lastName.trim()) return;

    addGuest({
      id: `g-${crypto.randomUUID().slice(0, 8)}`,
      orgId,
      eventId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      displayName: `${firstName.trim()} ${lastName.trim()}`,
      email: email.trim(),
      phone: phone.trim(),
      organization: organization.trim(),
      category,
      rsvpStatus,
      partySize: parseInt(partySize) || 1,
      dietaryRestrictions: dietaryRestrictions.trim(),
      accessibilityNeeds: accessibilityNeeds.trim(),
      notes: notes.trim(),
      relationshipTags: [],
      tablePreference: '',
      seatingPreference: '',
    });

    resetForm();
    onOpenChange(false);
  }

  const selectClasses = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add guest</DialogTitle>
          <DialogDescription>Add a new guest to this event. You can edit details and assign tags later.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="guest-first">First name</Label>
              <Input
                id="guest-first"
                placeholder="Jane"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-last">Last name</Label>
              <Input
                id="guest-last"
                placeholder="Smith"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="guest-email">Email</Label>
              <Input
                id="guest-email"
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-phone">Phone</Label>
              <Input
                id="guest-phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest-org">Organization</Label>
            <Input
              id="guest-org"
              placeholder="e.g. Smith Foundation"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="guest-category">Category</Label>
              <select
                id="guest-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as GuestCategory)}
                className={selectClasses}
              >
                {categoryOptions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-rsvp">RSVP status</Label>
              <select
                id="guest-rsvp"
                value={rsvpStatus}
                onChange={(e) => setRsvpStatus(e.target.value as RSVPStatus)}
                className={selectClasses}
              >
                {rsvpOptions.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-party">Party size</Label>
              <Input
                id="guest-party"
                type="number"
                min="1"
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest-dietary">Dietary restrictions</Label>
            <Input
              id="guest-dietary"
              placeholder="e.g. vegetarian, nut allergy"
              value={dietaryRestrictions}
              onChange={(e) => setDietaryRestrictions(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest-access">Accessibility needs</Label>
            <Input
              id="guest-access"
              placeholder="e.g. wheelchair accessible seating"
              value={accessibilityNeeds}
              onChange={(e) => setAccessibilityNeeds(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest-notes">Notes</Label>
            <Input
              id="guest-notes"
              placeholder="Any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!firstName.trim() || !lastName.trim()}>Add guest</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
