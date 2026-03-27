import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, FileSpreadsheet, FileText, Table2 } from 'lucide-react';
import type { EventAnalytics } from '@/lib/event-analytics';
import type { Guest } from '@/types/events';

const categoryLabels: Record<string, string> = {
  donor: 'Donor',
  scholarship_recipient: 'Scholar',
  family: 'Family',
  board_member: 'Board',
  vip: 'VIP',
  staff: 'Staff',
  sponsor: 'Sponsor',
  volunteer: 'Volunteer',
  other: 'Other',
};

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildGuestListCSV(analytics: EventAnalytics): string {
  const headers = [
    'First Name',
    'Last Name',
    'Display Name',
    'Email',
    'Phone',
    'Organization',
    'Category',
    'RSVP Status',
    'Party Size',
    'Dietary Restrictions',
    'Accessibility Needs',
    'Notes',
  ];
  const rows = analytics.eventGuests.map((g) => [
    g.firstName,
    g.lastName,
    g.displayName,
    g.email,
    g.phone,
    g.organization,
    categoryLabels[g.category] ?? g.category,
    g.rsvpStatus,
    String(g.partySize),
    g.dietaryRestrictions,
    g.accessibilityNeeds,
    g.notes,
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCSV).join(',')).join('\n');
}

function buildSeatingCSV(analytics: EventAnalytics): string {
  const headers = ['Table Name', 'Table Capacity', 'Zone', 'Seat', 'Guest Name', 'Category', 'RSVP Status'];
  const guestMap = new Map<string, Guest>(analytics.eventGuests.map((g) => [g.id, g]));
  const rows: string[][] = [];

  for (const summary of analytics.tableSummaries) {
    if (summary.guestIds.length === 0) {
      rows.push([summary.name, String(summary.capacity), summary.zone, '', '(empty)', '', '']);
    } else {
      summary.guestIds.forEach((guestId, index) => {
        const guest = guestMap.get(guestId);
        if (!guest) return;
        rows.push([
          summary.name,
          String(summary.capacity),
          summary.zone,
          String(index + 1),
          guest.displayName,
          categoryLabels[guest.category] ?? guest.category,
          guest.rsvpStatus,
        ]);
      });
    }
  }

  // Add unassigned guests
  for (const guest of analytics.unassignedConfirmed) {
    rows.push([
      '(Unassigned)',
      '',
      '',
      '',
      guest.displayName,
      categoryLabels[guest.category] ?? guest.category,
      guest.rsvpStatus,
    ]);
  }

  return [headers, ...rows].map((row) => row.map(escapeCSV).join(',')).join('\n');
}

function buildEventSummaryText(analytics: EventAnalytics): string {
  const { event, tableSummaries, confirmedGuests, unassignedConfirmed } = analytics;
  const guestMap = new Map<string, Guest>(analytics.eventGuests.map((g) => [g.id, g]));
  const assignedCount = confirmedGuests.length - unassignedConfirmed.length;
  const totalCapacity = analytics.tables.reduce((sum, t) => sum + t.capacity, 0);

  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push(`EVENT SUMMARY: ${event.name}`);
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Date:    ${event.date} at ${event.time}`);
  lines.push(`Venue:   ${event.venue}`);
  lines.push(`Address: ${event.venueAddress}`);
  lines.push(`Type:    ${event.type}`);
  lines.push(`Status:  ${event.status}`);
  lines.push('');
  lines.push('-'.repeat(40));
  lines.push('GUEST STATISTICS');
  lines.push('-'.repeat(40));
  lines.push(`Total Guests:       ${analytics.eventGuests.length}`);
  lines.push(`Confirmed:          ${confirmedGuests.length}`);
  lines.push(`Invited:            ${analytics.invitedGuests.length}`);
  lines.push(`Waitlisted:         ${analytics.waitlistGuests.length}`);
  lines.push(`Declined:           ${analytics.declinedGuests.length}`);
  lines.push(`Checked In:         ${analytics.checkedInGuests.length}`);
  lines.push('');
  lines.push('-'.repeat(40));
  lines.push('SEATING STATISTICS');
  lines.push('-'.repeat(40));
  lines.push(`Tables:             ${tableSummaries.length}`);
  lines.push(`Total Capacity:     ${totalCapacity}`);
  lines.push(`Assigned:           ${assignedCount}`);
  lines.push(`Unassigned:         ${unassignedConfirmed.length}`);
  lines.push(`Readiness Score:    ${analytics.readinessScore}/100 (${analytics.progressLabel})`);
  lines.push(`Households Split:   ${analytics.householdsSplitCount}`);
  lines.push('');
  lines.push('-'.repeat(40));
  lines.push('TABLE DETAILS');
  lines.push('-'.repeat(40));

  for (const summary of tableSummaries) {
    lines.push('');
    lines.push(`  ${summary.name} (${summary.zone} zone)`);
    lines.push(`  Capacity: ${summary.assigned}/${summary.capacity}`);
    if (summary.guestIds.length > 0) {
      summary.guestIds.forEach((guestId) => {
        const guest = guestMap.get(guestId);
        if (guest) {
          const extras = [guest.dietaryRestrictions, guest.accessibilityNeeds].filter(Boolean).join(', ');
          lines.push(
            `    - ${guest.displayName} [${categoryLabels[guest.category] ?? guest.category}]${extras ? ` (${extras})` : ''}`,
          );
        }
      });
    } else {
      lines.push('    (no guests assigned)');
    }
  }

  if (unassignedConfirmed.length > 0) {
    lines.push('');
    lines.push('-'.repeat(40));
    lines.push('UNASSIGNED CONFIRMED GUESTS');
    lines.push('-'.repeat(40));
    for (const guest of unassignedConfirmed) {
      lines.push(`  - ${guest.displayName} [${categoryLabels[guest.category] ?? guest.category}]`);
    }
  }

  lines.push('');
  lines.push('-'.repeat(40));
  lines.push('INSIGHTS');
  lines.push('-'.repeat(40));
  for (const insight of analytics.insights) {
    lines.push(`  [${insight.severity.toUpperCase()}] ${insight.title}`);
    lines.push(`    ${insight.detail}`);
  }

  lines.push('');
  lines.push('='.repeat(60));
  lines.push(`Generated on ${new Date().toLocaleString()}`);
  lines.push('Event Intelligence Hub');

  return lines.join('\n');
}

interface ExportReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analytics: EventAnalytics;
}

export function ExportReportModal({ open, onOpenChange, analytics }: ExportReportModalProps) {
  const safeName = analytics.event.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

  const handleGuestListCSV = () => {
    const csv = buildGuestListCSV(analytics);
    downloadFile(`${safeName}-guest-list.csv`, csv, 'text/csv;charset=utf-8;');
  };

  const handleSeatingCSV = () => {
    const csv = buildSeatingCSV(analytics);
    downloadFile(`${safeName}-seating-chart.csv`, csv, 'text/csv;charset=utf-8;');
  };

  const handleEventSummary = () => {
    const text = buildEventSummaryText(analytics);
    downloadFile(`${safeName}-event-summary.txt`, text, 'text/plain;charset=utf-8;');
  };

  const exportOptions = [
    {
      icon: FileSpreadsheet,
      title: 'Guest List (CSV)',
      description: 'All guests with contact info, RSVP status, category, dietary and accessibility notes.',
      onClick: handleGuestListCSV,
    },
    {
      icon: Table2,
      title: 'Seating Chart (CSV)',
      description: 'Table-by-table assignments with seat numbers, guest names, categories, and zones.',
      onClick: handleSeatingCSV,
    },
    {
      icon: FileText,
      title: 'Event Summary (Text)',
      description: 'Full event report with statistics, table details, unassigned guests, and insights.',
      onClick: handleEventSummary,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Report
          </DialogTitle>
          <DialogDescription>
            Choose a format to download event data for {analytics.event.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 mt-2">
          {exportOptions.map((option) => (
            <button
              key={option.title}
              onClick={option.onClick}
              className="flex items-start gap-4 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50 hover:border-primary/40 group"
            >
              <div className="shrink-0 rounded-md bg-muted p-2.5 group-hover:bg-primary/10 transition-colors">
                <option.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{option.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {option.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
