import { useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import { ExternalLink, Upload, Download, Webhook, QrCode, RefreshCw, Database, FileSpreadsheet, Zap, ArrowRight } from 'lucide-react';

const integrations = [
  { name: 'CSV Import/Export', description: 'Bulk import guests or export seating plans', icon: Upload, status: 'ready', category: 'Data' },
  { name: 'Eventbrite', description: 'Sync registrations and attendee data', icon: ExternalLink, status: 'available', category: 'Registration' },
  { name: 'Google Sheets', description: 'Two-way sync with spreadsheet data', icon: FileSpreadsheet, status: 'available', category: 'Data' },
  { name: 'RSVP Webhooks', description: 'Receive real-time RSVP updates via webhook', icon: Webhook, status: 'available', category: 'Automation' },
  { name: 'CRM / Donor Database', description: 'Import donor records and giving history', icon: Database, status: 'coming_soon', category: 'Data' },
  { name: 'QR Check-In', description: 'Generate QR codes for guest check-in', icon: QrCode, status: 'coming_soon', category: 'Operations' },
  { name: 'Registration Systems', description: 'Connect custom registration platforms', icon: RefreshCw, status: 'coming_soon', category: 'Registration' },
];

const statusConfig: Record<string, { label: string; badge: string; iconBg: string }> = {
  ready: {
    label: 'Ready',
    badge: 'bg-success/15 text-success border-success/30',
    iconBg: 'bg-success/10 text-success',
  },
  available: {
    label: 'Available',
    badge: 'bg-info/15 text-info border-info/30',
    iconBg: 'bg-info/10 text-info',
  },
  coming_soon: {
    label: 'Coming Soon',
    badge: 'bg-muted text-muted-foreground border-border',
    iconBg: 'bg-muted text-muted-foreground',
  },
  connected: {
    label: 'Connected',
    badge: 'bg-primary/15 text-primary border-primary/30',
    iconBg: 'bg-primary/10 text-primary',
  },
};

export default function EventIntegrations() {
  useParams();

  return (
    <div className="p-8 max-w-5xl animate-fade-in">
      <PageHeader
        title="Integrations"
        description="Connect external systems to sync data and automate workflows"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Upload className="w-3.5 h-3.5" /> Import Guests
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-3.5 h-3.5" /> Export Seating
            </Button>
          </div>
        }
      />

      {/* Integration cards */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {integrations.map((item) => {
          const config = statusConfig[item.status];
          const isDisabled = item.status === 'coming_soon';
          return (
            <div
              key={item.name}
              className={`glass-panel p-5 transition-all duration-200 group ${
                isDisabled
                  ? 'opacity-55 border-dashed border-border/50'
                  : 'hover:border-border/80 hover:bg-card/90 hover:shadow-lg hover:shadow-black/10 cursor-pointer'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${config.iconBg}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-foreground">{item.name}</h3>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.badge}`}>
                      {config.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                  <span className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mt-1.5 inline-block">{item.category}</span>
                </div>
                <Button
                  variant={isDisabled ? 'ghost' : 'outline'}
                  size="sm"
                  className={`text-xs shrink-0 transition-all ${
                    isDisabled
                      ? 'opacity-50'
                      : 'group-hover:border-primary/40 group-hover:text-primary'
                  }`}
                  disabled={isDisabled}
                >
                  {isDisabled ? (
                    <span className="flex items-center gap-1 text-muted-foreground/60">Notify Me</span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      Connect <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Webhook Activity */}
      <div className="glass-panel p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Recent Webhook Activity</h3>
        </div>
        <div className="space-y-1.5">
          {[
            { event: 'rsvp.confirmed', source: 'Eventbrite', time: '2 min ago', data: 'Guest: Maria Gonzalez' },
            { event: 'guest.updated', source: 'Google Sheets', time: '1 hour ago', data: 'Field: dietary_restrictions' },
            { event: 'rsvp.declined', source: 'Manual', time: '3 hours ago', data: 'Guest: David Chen' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <span className="font-mono text-xs text-primary">{item.event}</span>
              <span className="text-muted-foreground text-xs">from <span className="text-foreground/70">{item.source}</span></span>
              <span className="text-xs text-muted-foreground/60 hidden sm:inline">{item.data}</span>
              <span className="text-[11px] text-muted-foreground/50 ml-auto font-mono shrink-0">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
