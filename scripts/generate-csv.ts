/**
 * Run with: npx tsx scripts/generate-csv.ts
 * Outputs: public/scholarship-recipients-batch2.csv
 *
 * Generates a CSV of the second 100 scholarship recipients (recip-101 to recip-200)
 * for testing the CSV import feature.
 */

import { seedRecipients } from '../src/data/scholarship-seed-data';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HEADERS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'organization',
  'category',
  'rsvp_status',
  'party_size',
  'dietary_restrictions',
  'accessibility_needs',
  'notes',
  'table_preference',
  'seating_preference',
  'relationship_tags',
];

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const secondHalf = seedRecipients.slice(100, 200);

const rows = secondHalf.map((g) => [
  g.firstName,
  g.lastName,
  g.email,
  g.phone,
  g.organization,
  g.category,
  g.rsvpStatus,
  String(g.partySize),
  g.dietaryRestrictions,
  g.accessibilityNeeds,
  g.notes,
  g.tablePreference,
  g.seatingPreference,
  g.relationshipTags.join(';'),
]);

const csv = [
  HEADERS.join(','),
  ...rows.map((row) => row.map(escapeCSV).join(',')),
].join('\n');

const outPath = join(__dirname, '..', 'public', 'scholarship-recipients-batch2.csv');
writeFileSync(outPath, csv, 'utf-8');
console.log(`Wrote ${secondHalf.length} recipients to ${outPath}`);
