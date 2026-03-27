import { useRef } from 'react';
import type { EventAnalytics, TableSummary } from '@/lib/event-analytics';
import type { Guest } from '@/types/events';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

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

function getTableGuests(
  tableSummary: TableSummary,
  guests: Guest[],
): Guest[] {
  const idSet = new Set(tableSummary.guestIds);
  return guests.filter((g) => idSet.has(g.id));
}

interface PrintSeatingChartProps {
  analytics: EventAnalytics;
}

export function PrintSeatingChart({ analytics }: PrintSeatingChartProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Seating Chart - ${analytics.event.name}</title>
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #000;
            background: #fff;
            padding: 24px;
            font-size: 12px;
            line-height: 1.4;
          }
          .print-header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .print-header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
          .print-header .meta { font-size: 13px; color: #444; }
          .print-header .meta span { margin: 0 8px; }
          .summary-bar {
            display: flex;
            justify-content: center;
            gap: 32px;
            padding: 12px 0;
            border-bottom: 1px solid #ccc;
            margin-bottom: 20px;
            font-size: 13px;
          }
          .summary-bar .stat { text-align: center; }
          .summary-bar .stat-value { font-size: 18px; font-weight: 700; }
          .summary-bar .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
          .tables-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
          .table-card {
            border: 1px solid #999;
            border-radius: 4px;
            padding: 10px 12px;
            page-break-inside: avoid;
          }
          .table-card-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            border-bottom: 1px solid #ddd;
            padding-bottom: 6px;
            margin-bottom: 6px;
          }
          .table-name { font-size: 14px; font-weight: 700; }
          .table-capacity { font-size: 12px; color: #555; font-variant-numeric: tabular-nums; }
          .guest-row {
            display: flex;
            justify-content: space-between;
            padding: 2px 0;
            border-bottom: 1px dotted #eee;
          }
          .guest-row:last-child { border-bottom: none; }
          .guest-name { font-size: 12px; }
          .guest-category { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
          .guest-notes { font-size: 10px; color: #888; font-style: italic; }
          .empty-table { font-size: 11px; color: #999; font-style: italic; padding: 4px 0; }
          .footer {
            margin-top: 24px;
            padding-top: 12px;
            border-top: 1px solid #ccc;
            font-size: 10px;
            color: #999;
            text-align: center;
          }
          @media print {
            body { padding: 12px; }
            .tables-grid { gap: 10px; }
            .table-card { border-color: #666; }
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const { event, tableSummaries, eventGuests, confirmedGuests, unassignedConfirmed, tables } = analytics;
  const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
  const assignedCount = confirmedGuests.length - unassignedConfirmed.length;

  return (
    <>
      <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
        <Printer className="w-3.5 h-3.5" />
        Print Seating Chart
      </Button>

      {/* Hidden printable content */}
      <div ref={printRef} className="hidden">
        <div className="print-header">
          <h1>{event.name}</h1>
          <div className="meta">
            <span>{event.date} at {event.time}</span>
            <span>|</span>
            <span>{event.venue}</span>
          </div>
        </div>

        <div className="summary-bar">
          <div className="stat">
            <div className="stat-value">{confirmedGuests.length}</div>
            <div className="stat-label">Total Guests</div>
          </div>
          <div className="stat">
            <div className="stat-value">{tableSummaries.length}</div>
            <div className="stat-label">Tables</div>
          </div>
          <div className="stat">
            <div className="stat-value">{totalCapacity}</div>
            <div className="stat-label">Total Capacity</div>
          </div>
          <div className="stat">
            <div className="stat-value">{assignedCount}</div>
            <div className="stat-label">Assigned</div>
          </div>
          <div className="stat">
            <div className="stat-value">{unassignedConfirmed.length}</div>
            <div className="stat-label">Unassigned</div>
          </div>
        </div>

        <div className="tables-grid">
          {tableSummaries.map((summary) => {
            const tableGuests = getTableGuests(summary, eventGuests);
            return (
              <div key={summary.tableId} className="table-card">
                <div className="table-card-header">
                  <span className="table-name">{summary.name}</span>
                  <span className="table-capacity">
                    {summary.assigned} / {summary.capacity} seats
                  </span>
                </div>
                {tableGuests.length > 0 ? (
                  tableGuests.map((guest) => (
                    <div key={guest.id} className="guest-row">
                      <div>
                        <span className="guest-name">{guest.displayName}</span>
                        {(guest.dietaryRestrictions || guest.accessibilityNeeds) && (
                          <div className="guest-notes">
                            {[guest.dietaryRestrictions, guest.accessibilityNeeds]
                              .filter(Boolean)
                              .join(' | ')}
                          </div>
                        )}
                      </div>
                      <span className="guest-category">
                        {categoryLabels[guest.category] ?? guest.category}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="empty-table">No guests assigned</div>
                )}
              </div>
            );
          })}
        </div>

        {unassignedConfirmed.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div className="table-card" style={{ gridColumn: 'span 2' }}>
              <div className="table-card-header">
                <span className="table-name">Unassigned Guests</span>
                <span className="table-capacity">{unassignedConfirmed.length} guests</span>
              </div>
              {unassignedConfirmed.map((guest) => (
                <div key={guest.id} className="guest-row">
                  <span className="guest-name">{guest.displayName}</span>
                  <span className="guest-category">
                    {categoryLabels[guest.category] ?? guest.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="footer">
          Printed on {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })} — Event Intelligence Hub
        </div>
      </div>
    </>
  );
}
