import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useEventStore } from '@/data/store';
import type { Guest, GuestCategory, RSVPStatus } from '@/types/events';

const categoryOptions: { value: GuestCategory; label: string }[] = [
  { value: 'donor', label: 'Donor' },
  { value: 'scholarship_recipient', label: 'Scholarship Recipient' },
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
  { value: 'checked_in', label: 'Checked In' },
];

interface GuestFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  guest?: Guest | null;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  organization: string;
  category: GuestCategory;
  rsvpStatus: RSVPStatus;
  partySize: number;
  dietaryRestrictions: string;
  accessibilityNeeds: string;
  notes: string;
}

const defaultForm: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  organization: '',
  category: 'other',
  rsvpStatus: 'invited',
  partySize: 1,
  dietaryRestrictions: '',
  accessibilityNeeds: '',
  notes: '',
};

export default function GuestFormModal({ open, onOpenChange, eventId, guest }: GuestFormModalProps) {
  const addGuest = useEventStore((s) => s.addGuest);
  const updateGuest = useEventStore((s) => s.updateGuest);

  const [form, setForm] = useState<FormState>(defaultForm);

  const isEditing = Boolean(guest);

  useEffect(() => {
    if (guest) {
      setForm({
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
        phone: guest.phone,
        organization: guest.organization,
        category: guest.category,
        rsvpStatus: guest.rsvpStatus,
        partySize: guest.partySize,
        dietaryRestrictions: guest.dietaryRestrictions,
        accessibilityNeeds: guest.accessibilityNeeds,
        notes: guest.notes,
      });
    } else {
      setForm(defaultForm);
    }
  }, [guest, open]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!form.firstName.trim()) return;
    const displayName = `${form.firstName} ${form.lastName}`.trim();

    if (isEditing && guest) {
      updateGuest(guest.id, { ...form, displayName });
      toast.success('Guest updated');
    } else {
      const newGuest: Guest = {
        id: `g-${crypto.randomUUID()}`,
        eventId,
        ...form,
        displayName,
        relationshipTags: [],
        tablePreference: '',
        seatingPreference: '',
      };
      addGuest(newGuest);
      toast.success('Guest added successfully');
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Guest' : 'Add Guest'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => setField('firstName', e.target.value)}
                placeholder="Jane"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => setField('lastName', e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>

          {/* Contact row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Organization */}
          <div className="space-y-2">
            <Label htmlFor="organization">Organization</Label>
            <Input
              id="organization"
              value={form.organization}
              onChange={(e) => setField('organization', e.target.value)}
              placeholder="Acme Foundation"
            />
          </div>

          {/* Category & RSVP row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setField('category', v as GuestCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>RSVP Status</Label>
              <Select value={form.rsvpStatus} onValueChange={(v) => setField('rsvpStatus', v as RSVPStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rsvpOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Party size */}
          <div className="space-y-2">
            <Label htmlFor="partySize">Party Size</Label>
            <Input
              id="partySize"
              type="number"
              min={1}
              value={form.partySize}
              onChange={(e) => setField('partySize', Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>

          {/* Dietary restrictions */}
          <div className="space-y-2">
            <Label htmlFor="dietaryRestrictions">Dietary Restrictions</Label>
            <Input
              id="dietaryRestrictions"
              value={form.dietaryRestrictions}
              onChange={(e) => setField('dietaryRestrictions', e.target.value)}
              placeholder="e.g. vegetarian, gluten-free"
            />
          </div>

          {/* Accessibility needs */}
          <div className="space-y-2">
            <Label htmlFor="accessibilityNeeds">Accessibility Needs</Label>
            <Input
              id="accessibilityNeeds"
              value={form.accessibilityNeeds}
              onChange={(e) => setField('accessibilityNeeds', e.target.value)}
              placeholder="e.g. wheelchair access, hearing loop"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              placeholder="Additional notes..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.firstName.trim()}>
            {isEditing ? 'Save Changes' : 'Add Guest'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
