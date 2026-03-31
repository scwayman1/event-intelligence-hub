import { useState, useMemo } from 'react';
import { useEventStore } from '@/data/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tag, Plus, X, Link2 } from 'lucide-react';
import { collectAllTags } from '@/lib/rule-engine';
import { RelationshipPicker } from './RelationshipPicker';
import type { GuestCategory, RSVPStatus } from '@/types/events';

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
];

interface AddGuestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  orgId: string;
}

export function AddGuestDialog({ open, onOpenChange, eventId, orgId }: AddGuestDialogProps) {
  const addGuest = useEventStore((s) => s.addGuest);
  const addRelationshipMembership = useEventStore((s) => s.addRelationshipMembership);
  const guests = useEventStore((s) => s.guests);

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

  // Relationship memberships (pending, applied on save)
  const [pendingMemberships, setPendingMemberships] = useState<Array<{ groupId: string; role: string }>>([]);

  // Legacy freeform tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const eventGuests = useMemo(() => guests.filter((g) => g.eventId === eventId), [guests, eventId]);
  const allExistingTags = useMemo(() => collectAllTags(eventGuests), [eventGuests]);
  const tagSuggestions = useMemo(() => allExistingTags.filter((t) => !tags.includes(t)), [allExistingTags, tags]);

  function normalizeTag(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, '-');
  }

  function addTag(raw: string) {
    const tag = normalizeTag(raw);
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
  }

  function resetForm() {
    setFirstName(''); setLastName(''); setEmail(''); setPhone('');
    setOrganization(''); setCategory('other'); setRsvpStatus('invited');
    setPartySize('1'); setDietaryRestrictions(''); setAccessibilityNeeds('');
    setNotes(''); setPendingMemberships([]); setTags([]); setTagInput('');
  }

  function handleCreate() {
    if (!firstName.trim() || !lastName.trim()) return;

    const guestId = `g-${crypto.randomUUID().slice(0, 8)}`;

    addGuest({
      id: guestId,
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
      relationshipTags: tags,
      tablePreference: '',
      seatingPreference: '',
    });

    // Create relationship memberships
    for (const m of pendingMemberships) {
      addRelationshipMembership({
        id: `rm-${crypto.randomUUID().slice(0, 8)}`,
        groupId: m.groupId,
        guestId,
        role: m.role,
      });
    }

    resetForm();
    onOpenChange(false);
  }

  const selectClasses = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add guest</DialogTitle>
          <DialogDescription>Add a guest and connect them to relationship groups for smart seating.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="guest-first">First name</Label>
              <Input id="guest-first" placeholder="Jane" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-last">Last name</Label>
              <Input id="guest-last" placeholder="Smith" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="guest-email">Email</Label>
              <Input id="guest-email" type="email" placeholder="jane@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-phone">Phone</Label>
              <Input id="guest-phone" type="tel" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          {/* Organization */}
          <div className="space-y-2">
            <Label htmlFor="guest-org">Organization</Label>
            <Input id="guest-org" placeholder="e.g. Smith Foundation" value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>

          {/* Category / RSVP / Party */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="guest-category">Category</Label>
              <select id="guest-category" value={category} onChange={(e) => setCategory(e.target.value as GuestCategory)} className={selectClasses}>
                {categoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-rsvp">RSVP</Label>
              <select id="guest-rsvp" value={rsvpStatus} onChange={(e) => setRsvpStatus(e.target.value as RSVPStatus)} className={selectClasses}>
                {rsvpOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-party">Party size</Label>
              <Input id="guest-party" type="number" min="1" max={50} value={partySize} onChange={(e) => setPartySize(e.target.value)} />
            </div>
          </div>

          {/* Relationship Groups — the key feature */}
          <div className="space-y-2 border border-primary/20 rounded-lg p-3 bg-primary/5">
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-primary" />
              <Label className="text-sm font-semibold text-primary">Relationships</Label>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Connect this guest to a scholarship, family, mentorship, or other group. Members of the same group are seated together by the seating engine.
            </p>
            <RelationshipPicker
              eventId={eventId}
              orgId={orgId}
              selectedMemberships={pendingMemberships}
              onMembershipsChange={setPendingMemberships}
            />
          </div>

          {/* Freeform tags (secondary) */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Additional tags (optional)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. keynote-speaker, table-host"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); setTagInput(''); } }}
                className="h-8 text-sm"
              />
              <Button variant="outline" size="sm" className="h-8 px-3 shrink-0" onClick={() => { addTag(tagInput); setTagInput(''); }} disabled={!tagInput.trim()}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                    <Tag className="w-2.5 h-2.5" />{t}
                    <button onClick={() => setTags(tags.filter((x) => x !== t))} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
            {tagSuggestions.length > 0 && tags.length === 0 && (
              <div className="flex flex-wrap gap-1">
                {tagSuggestions.slice(0, 6).map((t) => (
                  <button key={t} onClick={() => addTag(t)} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 border border-border text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors">
                    + {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dietary / Accessibility / Notes */}
          <div className="space-y-2">
            <Label htmlFor="guest-dietary">Dietary restrictions</Label>
            <Input id="guest-dietary" placeholder="e.g. vegetarian, nut allergy" value={dietaryRestrictions} onChange={(e) => setDietaryRestrictions(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest-access">Accessibility needs</Label>
            <Input id="guest-access" placeholder="e.g. wheelchair accessible seating" value={accessibilityNeeds} onChange={(e) => setAccessibilityNeeds(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest-notes">Notes</Label>
            <Input id="guest-notes" placeholder="Any additional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
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
