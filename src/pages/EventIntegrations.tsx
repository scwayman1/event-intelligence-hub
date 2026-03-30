import { useParams, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Upload, Download, Webhook, QrCode, RefreshCw, Database, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

const integrations = [
  { name: 'Eventbrite', description: 'Sync registrations and attendee data', icon: ExternalLink, status: 'available', category: 'Registration' },
  { name: 'CRM / Donor Database', description: 'Import donor records and giving history', icon: Database, status: 'coming_soon', category: 'Data' },
  { name: 'Google Sheets', description: 'Two-way sync with spreadsheet data', icon: FileSpreadsheet, status: 'available', category: 'Data' },
  { name: 'CSV Import/Export', description: 'Bulk import guests or export seating plans', icon: Upload, status: 'ready', category: 'Data' },
  { name: 'RSVP Webhooks', description: 'Receive real-time RSVP updates via webhook', icon: Webhook, status: 'available', category: 'Automation' },
  { name: 'QR Check-In', description: 'Generate QR codes for guest check-in', icon: QrCode, status: 'coming_soon', category: 'Operations' },
  { name: 'Registration Systems', description: 'Connect custom registration platforms', icon: RefreshCw, status: 'coming_soon', category: 'Registration' },
];

const statusLabels: Record<string, { label: string; color: string }> = {
  ready: { label: 'Ready', color: 'bg-success/20 text-success border-success/30' },
  available: { label: 'Available', color: 'bg-info/20 text-info border-info/30' },
  coming_soon: { label: 'Coming Soon', color: 'bg-muted text-muted-foreground border-border' },
  connected: { label: 'Connected', color: 'bg-primary/20 text-primary border-primary/30' },
};

export default function EventIntegrations() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">Connect external systems to sync data and automate workflows</p>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mb-8">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/events/${eventId}/guests`)}><Upload className="w-3.5 h-3.5" />Import Guests</Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => toast.info('Export seating coming soon')}><Download className="w-3.5 h-3.5" />Export Seating</Button>
      </div>

      {/* Integration cards */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {integrations.map((item) => {
          const status = statusLabels[item.status];
          return (
            <div key={item.name} className="glass-panel p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-foreground">{item.name}</h3>
                    <Badge variant="outline" className={`text-xs ${status.color}`}>{status.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                  <p className="text-xs text-muted-foreground mt-1 opacity-60">{item.category}</p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs" disabled={item.status === 'coming_soon'} onClick={() => toast.info(`${item.name} integration coming soon`)}>
                  {item.status === 'coming_soon' ? 'Soon' : 'Connect'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Webhook concept */}
      <div className="glass-panel p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Webhook Activity</h3>
        <div className="space-y-2">
          {[
            { event: 'rsvp.confirmed', source: 'Eventbrite', time: '2 min ago', data: 'Guest: Maria Gonzalez' },
            { event: 'guest.updated', source: 'Google Sheets', time: '1 hour ago', data: 'Field: dietary_restrictions' },
            { event: 'rsvp.declined', source: 'Manual', time: '3 hours ago', data: 'Guest: David Chen' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-md bg-muted/30 text-sm">
              <span className="font-mono text-xs text-primary">{item.event}</span>
              <span className="text-muted-foreground">from {item.source}</span>
              <span className="text-xs text-muted-foreground ml-auto font-mono">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
