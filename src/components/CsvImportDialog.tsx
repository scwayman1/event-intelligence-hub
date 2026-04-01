import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEventStore } from '@/data/store';
import { toast } from 'sonner';
import type { Guest, GuestCategory, RSVPStatus } from '@/types/events';

interface CsvImportDialogProps {
  eventId: string;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VALID_CATEGORIES: GuestCategory[] = ['donor', 'scholarship_recipient', 'family', 'board_member', 'vip', 'staff', 'sponsor', 'volunteer', 'dignitary', 'other'];
const VALID_RSVP: RSVPStatus[] = ['invited', 'confirmed', 'declined', 'waitlist', 'checked_in'];

interface ParsedRow {
  row: number;
  guest: Guest | null;
  errors: string[];
}

function detectDelimiter(text: string): string {
  // Check first line to detect delimiter (tab vs comma)
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

function parseCSV(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(current.trim());
        current = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim());
        current = '';
        if (row.some((c) => c !== '')) rows.push(row);
        row = [];
        if (ch === '\r') i++; // skip \r\n
      } else {
        current += ch;
      }
    }
  }
  // Last row
  row.push(current.trim());
  if (row.some((c) => c !== '')) rows.push(row);

  return rows;
}

const EXPECTED_HEADERS = [
  'first_name', 'last_name', 'email', 'phone', 'organization',
  'category', 'rsvp_status', 'party_size', 'dietary_restrictions',
  'accessibility_needs', 'notes', 'table_preference', 'seating_preference',
  'relationship_tags', 'additional_tags',
];

function parseRow(
  cols: string[],
  headerMap: Map<string, number>,
  rowNum: number,
  eventId: string,
  orgId: string,
): ParsedRow {
  const errors: string[] = [];

  const get = (key: string) => {
    const idx = headerMap.get(key);
    return idx !== undefined && idx < cols.length ? cols[idx].trim() : '';
  };

  const firstName = get('first_name');
  const lastName = get('last_name');
  const email = get('email');
  const phone = get('phone');
  const organization = get('organization');
  const rawCategory = get('category').toLowerCase().replace(/\s+/g, '_');
  const rawRsvp = get('rsvp_status').toLowerCase().replace(/\s+/g, '_');

  // Normalize common category aliases
  const CATEGORY_ALIASES: Record<string, GuestCategory> = {
    donor: 'donor',
    scholar: 'scholarship_recipient',
    scholarship: 'scholarship_recipient',
    scholarship_recipient: 'scholarship_recipient',
    recipient: 'scholarship_recipient',
    student: 'scholarship_recipient',
    family: 'family',
    board: 'board_member',
    board_member: 'board_member',
    vip: 'vip',
    staff: 'staff',
    sponsor: 'sponsor',
    volunteer: 'volunteer',
    dignitary: 'dignitary',
    other: 'other',
  };

  const RSVP_ALIASES: Record<string, RSVPStatus> = {
    invited: 'invited',
    pending: 'invited',
    sent: 'invited',
    awaiting: 'invited',
    not_responded: 'invited',
    no_response: 'invited',
    confirmed: 'confirmed',
    yes: 'confirmed',
    accepted: 'confirmed',
    attending: 'confirmed',
    going: 'confirmed',
    rsvp_yes: 'confirmed',
    declined: 'declined',
    no: 'declined',
    not_attending: 'declined',
    regrets: 'declined',
    rsvp_no: 'declined',
    cancelled: 'declined',
    canceled: 'declined',
    waitlist: 'waitlist',
    waitlisted: 'waitlist',
    wait_list: 'waitlist',
    standby: 'waitlist',
    maybe: 'waitlist',
    tentative: 'waitlist',
    checked_in: 'checked_in',
    'checked in': 'checked_in',
    checkedin: 'checked_in',
    arrived: 'checked_in',
    present: 'checked_in',
  };

  const category = CATEGORY_ALIASES[rawCategory] ?? (rawCategory as GuestCategory);
  const rsvpStatus = RSVP_ALIASES[rawRsvp] ?? (rawRsvp as RSVPStatus);
  const partySizeStr = get('party_size');
  const dietaryRestrictions = get('dietary_restrictions');
  const accessibilityNeeds = get('accessibility_needs');
  const notes = get('notes');
  const tablePreference = get('table_preference');
  const seatingPreference = get('seating_preference');
  const relationshipTagsStr = get('relationship_tags');
  const additionalTagsStr = get('additional_tags');

  if (!firstName) errors.push('Missing first_name');
  if (!lastName) errors.push('Missing last_name');

  if (category && !VALID_CATEGORIES.includes(category)) {
    errors.push(`Invalid category "${category}"`);
  }
  if (rsvpStatus && !VALID_RSVP.includes(rsvpStatus)) {
    errors.push(`Invalid rsvp_status "${rsvpStatus}"`);
  }

  const partySize = partySizeStr ? parseInt(partySizeStr, 10) : 1;
  if (isNaN(partySize) || partySize < 1) errors.push(`Invalid party_size "${partySizeStr}"`);

  // Merge relationship_tags and additional_tags into one tags array
  // Support both semicolon and comma as separators
  const splitTags = (s: string) => s.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
  const tags = [
    ...(relationshipTagsStr ? splitTags(relationshipTagsStr) : []),
    ...(additionalTagsStr ? splitTags(additionalTagsStr) : []),
  ];

  if (errors.length > 0) {
    return { row: rowNum, guest: null, errors };
  }

  const guest: Guest = {
    id: `csv-import-${crypto.randomUUID()}`,
    orgId,
    eventId,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    email: email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@imported.csv`,
    phone,
    organization,
    category: category || 'other',
    rsvpStatus: rsvpStatus || 'invited',
    partySize: isNaN(partySize) ? 1 : partySize,
    dietaryRestrictions,
    accessibilityNeeds,
    notes,
    relationshipTags: tags,
    tablePreference,
    seatingPreference,
  };

  return { row: rowNum, guest, errors: [] };
}

export function CsvImportDialog({ eventId, orgId, open, onOpenChange }: CsvImportDialogProps) {
  const addGuest = useEventStore((s) => s.addGuest);
  const updateGuest = useEventStore((s) => s.updateGuest);
  const existingGuests = useEventStore((s) => s.guests);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);

  const validRows = parsed.filter((r) => r.guest !== null);
  const errorRows = parsed.filter((r) => r.errors.length > 0);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error('CSV file appears empty or has no data rows.');
        return;
      }

      // Build header map (case-insensitive, normalize spaces to underscores)
      const headers = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, '_'));
      const headerMap = new Map<string, number>();
      headers.forEach((h, i) => headerMap.set(h, i));

      // Map common header aliases to canonical names
      const HEADER_ALIASES: Record<string, string> = {
        'first': 'first_name', 'firstname': 'first_name', 'first_name': 'first_name', 'given_name': 'first_name',
        'last': 'last_name', 'lastname': 'last_name', 'last_name': 'last_name', 'surname': 'last_name', 'family_name': 'last_name',
        'email': 'email', 'email_address': 'email',
        'phone': 'phone', 'phone_number': 'phone', 'telephone': 'phone', 'mobile': 'phone',
        'organization': 'organization', 'org': 'organization', 'company': 'organization', 'major': 'organization', 'department': 'organization', 'school': 'organization',
        'category': 'category', 'type': 'category', 'guest_type': 'category', 'guest_category': 'category', 'role': 'category',
        'rsvp_status': 'rsvp_status', 'rsvp': 'rsvp_status', 'status': 'rsvp_status', 'response': 'rsvp_status', 'attending': 'rsvp_status',
        'party_size': 'party_size', 'partysize': 'party_size', 'guests': 'party_size', 'party': 'party_size', 'group_size': 'party_size', 'family_size': 'party_size', 'number_attending': 'party_size',
        'dietary_restrictions': 'dietary_restrictions', 'dietary': 'dietary_restrictions', 'diet': 'dietary_restrictions', 'food': 'dietary_restrictions', 'food_restrictions': 'dietary_restrictions', 'dietary_needs': 'dietary_restrictions', 'meal_preference': 'dietary_restrictions',
        'accessibility_needs': 'accessibility_needs', 'accessibility': 'accessibility_needs', 'access': 'accessibility_needs', 'special_needs': 'accessibility_needs', 'accommodations': 'accessibility_needs',
        'notes': 'notes', 'comments': 'notes', 'note': 'notes',
        'table_preference': 'table_preference', 'table': 'table_preference', 'preferred_table': 'table_preference',
        'seating_preference': 'seating_preference', 'seating': 'seating_preference', 'seat_preference': 'seating_preference',
        'relationship_tags': 'relationship_tags', 'tags': 'relationship_tags', 'groups': 'relationship_tags', 'relationships': 'relationship_tags',
        'relationship_group': 'relationship_tags', 'group': 'relationship_tags',
        'additional_tags': 'additional_tags',
      };

      // Resolve aliases into canonical header map
      const canonicalMap = new Map<string, number>();
      for (const [header, idx] of headerMap) {
        const canonical = HEADER_ALIASES[header] ?? header;
        if (!canonicalMap.has(canonical)) {
          canonicalMap.set(canonical, idx);
        }
      }

      // Parse data rows
      const results: ParsedRow[] = [];
      for (let i = 1; i < rows.length; i++) {
        results.push(parseRow(rows[i], canonicalMap, i + 1, eventId, orgId));
      }
      setParsed(results);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    try {
      let added = 0;
      let updated = 0;

      // Build lookup of existing guests by email (lowercase) for this event
      const emailIndex = new Map<string, string>();
      for (const g of existingGuests) {
        if (g.eventId === eventId && g.email) {
          emailIndex.set(g.email.toLowerCase(), g.id);
        }
      }

      for (const row of validRows) {
        if (!row.guest) continue;

        // Check if guest already exists by email match
        const existingId = row.guest.email
          ? emailIndex.get(row.guest.email.toLowerCase())
          : undefined;

        if (existingId) {
          // Update existing guest with CSV data (preserves their ID)
          const { id: _id, ...updates } = row.guest;
          updateGuest(existingId, updates);
          updated++;
        } else {
          addGuest(row.guest);
          added++;
        }
      }

      const parts = [];
      if (added > 0) parts.push(`${added} new`);
      if (updated > 0) parts.push(`${updated} updated`);
      toast.success(`Import complete: ${parts.join(', ')} guests!`);
      setParsed([]);
      setFileName('');
      onOpenChange(false);
    } catch (error) {
      toast.error(
        `Import failed: ${error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.'}`
      );
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full max-w-lg bg-background border border-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Import Guests from CSV</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {!fileName ? (
            <>
              <p className="text-sm text-muted-foreground">
                Upload a CSV file with guest data. Expected columns:
              </p>
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 font-mono">
                {EXPECTED_HEADERS.join(', ')}
              </div>
              <p className="text-xs text-muted-foreground">
                Only <strong>first_name</strong> and <strong>last_name</strong> are required. Other columns are optional.
                Use semicolons to separate multiple relationship tags.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                className="w-full gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
                Choose CSV File
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <span className="font-medium">{fileName}</span>
                <button
                  onClick={() => { setParsed([]); setFileName(''); }}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  Change file
                </button>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{parsed.length}</p>
                  <p className="text-xs text-muted-foreground">Total rows</p>
                </div>
                <div className="rounded-lg border border-success/30 p-3 text-center">
                  <p className="text-2xl font-bold text-success">{validRows.length}</p>
                  <p className="text-xs text-muted-foreground">Valid</p>
                </div>
                <div className="rounded-lg border border-destructive/30 p-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{errorRows.length}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>

              {/* Error details */}
              {errorRows.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                  {errorRows.slice(0, 20).map((r) => (
                    <div key={r.row} className="flex items-start gap-2 text-xs">
                      <AlertTriangle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                      <span className="text-destructive">
                        Row {r.row}: {r.errors.join(', ')}
                      </span>
                    </div>
                  ))}
                  {errorRows.length > 20 && (
                    <p className="text-xs text-destructive">...and {errorRows.length - 20} more errors</p>
                  )}
                </div>
              )}

              {/* Preview */}
              {validRows.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Preview (first 10):</p>
                  {validRows.slice(0, 10).map((r) => (
                    <div key={r.row} className="flex items-center gap-2 text-xs py-0.5">
                      <Check className="w-3 h-3 text-success shrink-0" />
                      <span>{r.guest!.displayName}</span>
                      <span className="text-muted-foreground">({r.guest!.category})</span>
                      <span className="text-muted-foreground ml-auto">{r.guest!.rsvpStatus}</span>
                    </div>
                  ))}
                  {validRows.length > 10 && (
                    <p className="text-xs text-muted-foreground mt-1">...and {validRows.length - 10} more</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {fileName && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handleImport}
              disabled={validRows.length === 0 || importing}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              {importing ? 'Importing...' : `Import ${validRows.length} Guests`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
