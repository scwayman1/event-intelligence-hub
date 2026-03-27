import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, FileUp, Upload } from 'lucide-react';
import { useEventStore } from '@/data/store';
import type { Guest, GuestCategory, RSVPStatus } from '@/types/events';

interface CSVImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
}

type ParsedRow = Record<string, string>;

const VALID_CATEGORIES: GuestCategory[] = [
  'donor', 'scholarship_recipient', 'family', 'board_member',
  'vip', 'staff', 'sponsor', 'volunteer', 'other',
];

const VALID_RSVP: RSVPStatus[] = [
  'invited', 'confirmed', 'declined', 'waitlist', 'checked_in',
];

const KNOWN_COLUMNS = [
  'firstName', 'lastName', 'email', 'phone', 'organization',
  'category', 'rsvpStatus', 'dietaryRestrictions', 'accessibilityNeeds', 'notes',
];

/** Parse a single CSV line, handling quoted fields with commas inside. */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

  const aliases: Record<string, string[]> = {
    firstName: ['firstname', 'first', 'fname', 'givenname'],
    lastName: ['lastname', 'last', 'lname', 'surname', 'familyname'],
    email: ['email', 'emailaddress', 'mail'],
    phone: ['phone', 'phonenumber', 'tel', 'telephone', 'mobile', 'cell'],
    organization: ['organization', 'org', 'company', 'employer', 'affiliation'],
    category: ['category', 'type', 'guesttype', 'guestcategory', 'role'],
    rsvpStatus: ['rsvpstatus', 'rsvp', 'status', 'response'],
    dietaryRestrictions: ['dietaryrestrictions', 'dietary', 'diet', 'foodrestrictions', 'allergies'],
    accessibilityNeeds: ['accessibilityneeds', 'accessibility', 'access', 'specialneeds', 'accommodations'],
    notes: ['notes', 'note', 'comments', 'comment', 'memo'],
  };

  for (const header of headers) {
    const norm = normalize(header);
    for (const [field, aliasList] of Object.entries(aliases)) {
      if (aliasList.includes(norm) && !mapping[field]) {
        mapping[field] = header;
        break;
      }
    }
  }

  return mapping;
}

function buildWarnings(rows: ParsedRow[], mapping: Record<string, string>): string[] {
  const warnings: string[] = [];
  const firstNameCol = mapping.firstName;
  const lastNameCol = mapping.lastName;

  if (!firstNameCol && !lastNameCol) {
    warnings.push('No name columns detected. Guests will have empty names.');
  }

  let missingNameCount = 0;
  for (const row of rows) {
    const first = firstNameCol ? row[firstNameCol]?.trim() : '';
    const last = lastNameCol ? row[lastNameCol]?.trim() : '';
    if (!first && !last) missingNameCount++;
  }

  if (missingNameCount > 0 && (firstNameCol || lastNameCol)) {
    warnings.push(`${missingNameCount} row(s) have no name and will be skipped.`);
  }

  return warnings;
}

export default function CSVImportModal({ open, onOpenChange, eventId }: CSVImportModalProps) {
  const addGuest = useEventStore((s) => s.addGuest);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [imported, setImported] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setWarnings([]);
    setFileName('');
    setImported(false);
    setImportCount(0);
  }, []);

  const handleFileContent = useCallback((text: string, name: string) => {
    const { headers: h, rows: r } = parseCSV(text);
    const m = detectColumnMapping(h);
    const w = buildWarnings(r, m);
    setHeaders(h);
    setRows(r);
    setMapping(m);
    setWarnings(w);
    setFileName(name);
    setImported(false);
    setImportCount(0);
  }, []);

  const handleFileSelect = useCallback((file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      handleFileContent(text, file.name);
    };
    reader.readAsText(file);
  }, [handleFileContent]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const handleImport = useCallback(() => {
    let count = 0;

    for (const row of rows) {
      const firstName = mapping.firstName ? (row[mapping.firstName]?.trim() ?? '') : '';
      const lastName = mapping.lastName ? (row[mapping.lastName]?.trim() ?? '') : '';
      const displayName = `${firstName} ${lastName}`.trim();

      if (!displayName) continue;

      const rawCategory = mapping.category ? row[mapping.category]?.trim().toLowerCase() : '';
      const rawRsvp = mapping.rsvpStatus ? row[mapping.rsvpStatus]?.trim().toLowerCase() : '';

      const category: GuestCategory = VALID_CATEGORIES.includes(rawCategory as GuestCategory)
        ? (rawCategory as GuestCategory)
        : 'other';
      const rsvpStatus: RSVPStatus = VALID_RSVP.includes(rawRsvp as RSVPStatus)
        ? (rawRsvp as RSVPStatus)
        : 'invited';

      const guest: Guest = {
        id: `g-${crypto.randomUUID()}`,
        eventId,
        firstName,
        lastName,
        displayName,
        email: mapping.email ? (row[mapping.email]?.trim() ?? '') : '',
        phone: mapping.phone ? (row[mapping.phone]?.trim() ?? '') : '',
        organization: mapping.organization ? (row[mapping.organization]?.trim() ?? '') : '',
        category,
        rsvpStatus,
        partySize: 1,
        dietaryRestrictions: mapping.dietaryRestrictions ? (row[mapping.dietaryRestrictions]?.trim() ?? '') : '',
        accessibilityNeeds: mapping.accessibilityNeeds ? (row[mapping.accessibilityNeeds]?.trim() ?? '') : '',
        notes: mapping.notes ? (row[mapping.notes]?.trim() ?? '') : '',
        relationshipTags: [],
        tablePreference: '',
        seatingPreference: '',
      };

      addGuest(guest);
      count++;
    }

    setImportCount(count);
    setImported(true);
    toast.success(`${count} guest${count !== 1 ? 's' : ''} imported`);
  }, [rows, mapping, eventId, addGuest]);

  const handleOpenChange = useCallback((value: boolean) => {
    if (!value) reset();
    onOpenChange(value);
  }, [onOpenChange, reset]);

  const validRows = rows.filter((row) => {
    const firstName = mapping.firstName ? (row[mapping.firstName]?.trim() ?? '') : '';
    const lastName = mapping.lastName ? (row[mapping.lastName]?.trim() ?? '') : '';
    return `${firstName} ${lastName}`.trim() !== '';
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Guests from CSV</DialogTitle>
        </DialogHeader>

        {imported ? (
          <div className="py-8 text-center space-y-4">
            <div className="text-4xl">&#10003;</div>
            <p className="text-lg font-medium text-foreground">
              Successfully imported {importCount} guest{importCount !== 1 ? 's' : ''}
            </p>
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </div>
        ) : rows.length === 0 ? (
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground mb-1">
              Drop a CSV file here or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Expected columns: firstName, lastName, email, phone, organization, category, rsvpStatus, etc.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{fileName}</span> &mdash;{' '}
                {rows.length} row{rows.length !== 1 ? 's' : ''} parsed,{' '}
                <span className="text-primary font-medium">{validRows.length}</span> ready to import
              </p>
              <Button variant="ghost" size="sm" onClick={reset}>
                Choose different file
              </Button>
            </div>

            {/* Column mapping summary */}
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Column Mapping (auto-detected)
              </p>
              <div className="flex flex-wrap gap-2">
                {KNOWN_COLUMNS.map((col) => (
                  <span
                    key={col}
                    className={`text-xs px-2 py-1 rounded ${
                      mapping[col]
                        ? 'bg-success/15 text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {col}: {mapping[col] ?? 'unmapped'}
                  </span>
                ))}
              </div>
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-1">
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-warning flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            {/* Preview table */}
            <div className="overflow-x-auto rounded-lg border border-border/60 max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    {headers.map((h) => (
                      <th
                        key={h}
                        className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      {headers.map((h) => (
                        <td key={h} className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate">
                          {row[h] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length > 50 && (
                    <tr>
                      <td colSpan={headers.length} className="px-3 py-2 text-muted-foreground text-center">
                        ... and {rows.length - 50} more rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={validRows.length === 0} className="gap-2">
                <Upload className="w-3.5 h-3.5" />
                Import {validRows.length} Guest{validRows.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
