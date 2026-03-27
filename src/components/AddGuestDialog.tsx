import { useState, useMemo } from 'react';
import { useEventStore } from '@/data/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tag, Plus, X } from 'lucide-react';
import { collectAllTags } from '@/lib/rule-engine';
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

  // Scholarship / fund association
  const [fundInput, setFundInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Collect existing tags from this event's guests to suggest
  const eventGuests = useMemo(() => guests.filter((g) => g.eventId === eventId), [guests, eventId]);
  const allExistingTags = useMemo(() => collectAllTags(eventGuests), [eventGuests]);

  // Separate fund-like tags from other tags for suggestions
  const fundSuggestions = useMemo(() =>
    allExistingTags.filter((t) => t.includes('scholarship') || t.includes('fund') || t.includes('award') || t.includes('grant') || t.includes('endowment')),
    [allExistingTags]
  );
  const otherTagSuggestions = useMemo(() =>
    allExistingTags.filter((t) => !tags.includes(t)),
    [allExistingTags, tags]
  );

  function normalizeTag(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, '-');
  }

  function addTag(raw: string) {
    const tag = normalizeTag(raw);
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function addFundAsTag() {
    if (!fundInput.trim()) return;
    const fundTag = normalizeTag(fundInput);
    // Add the fund name as a tag if not already present
    if (!tags.includes(fundTag)) {
      setTags([...tags, fundTag]);
    }
    setFundInput('');
  }

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
    setFundInput('');
    setTags([]);
    setTagInput('');
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
      relationshipTags: tags,
      tablePreference: '',
      seatingPreference: '',
    });

    resetForm();
    onOpenChange(false);
  }

  const selectClasses = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  // Hint text based on category
  const fundHint = category === 'donor'
    ? 'e.g. "Scott Wehman Scholarship" — recipients with the same tag will be seated together'
    : category === 'scholarship_recipient'
      ? 'e.g. "Scott Wehman Scholarship" — the donor with the same tag will be seated together'
      : 'e.g. "Scott Wehman Scholarship" — guests with matching tags can be seated together';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add guest</DialogTitle>
          <DialogDescription>Add a new guest to this event. Tags link donors and recipients for seating rules.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
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

          {/* Scholarship / Fund Association */}
          <div className="space-y-2 border border-primary/20 rounded-lg p-3 bg-primary/5">
            <div className="flex items-center gap-2 mb-1">
              <Tag className="w-3.5 h-3.5 text-primary" />
              <Label className="text-sm font-semibold text-primary">Scholarship / Fund Association</Label>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">{fundHint}</p>
            <div className="flex gap-2">
              <Input
                placeholder="Type a scholarship or fund name..."
                value={fundInput}
                onChange={(e) => setFundInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFundAsTag(); } }}
                className="h-8 text-sm"
              />
              <Button variant="outline" size="sm" className="h-8 px-3 shrink-0" onClick={addFundAsTag} disabled={!fundInput.trim()}>
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            {fundSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                <span className="text-[10px] text-muted-foreground mr-1">Existing:</span>
                {fundSuggestions.filter((t) => !tags.includes(t)).map((t) => (
                  <button
                    key={t}
                    onClick={() => addTag(t)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Additional Tags */}
          <div className="space-y-2">
            <Label>Additional Tags</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. table-host, keynote-speaker"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); setTagInput(''); } }}
                className="h-8 text-sm"
              />
              <Button variant="outline" size="sm" className="h-8 px-3 shrink-0" onClick={() => { addTag(tagInput); setTagInput(''); }} disabled={!tagInput.trim()}>
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            {otherTagSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {otherTagSuggestions.filter((t) => !fundSuggestions.includes(t)).slice(0, 10).map((t) => (
                  <button
                    key={t}
                    onClick={() => addTag(t)}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 border border-border text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Applied tags display */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                  <Tag className="w-3 h-3" />
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:text-destructive ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

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
