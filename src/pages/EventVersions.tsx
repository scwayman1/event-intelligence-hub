import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Copy, Check, Clock, Archive, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
  active: { color: 'bg-success/20 text-success border-success/30', icon: Check },
  draft: { color: 'bg-info/20 text-info border-info/30', icon: Clock },
  archived: { color: 'bg-muted text-muted-foreground border-border', icon: Archive },
  approved: { color: 'bg-primary/20 text-primary border-primary/30', icon: Check },
};

export default function EventVersions() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const versions = useEventStore((s) => s.versions);
  const addVersion = useEventStore((s) => s.addVersion);
  const updateEvent = useEventStore((s) => s.updateEvent);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);

  const event = events.find((e) => e.id === eventId);
  const eventVersions = versions.filter((v) => v.eventId === eventId);

  if (!event) return <div className="p-8 text-muted-foreground">Event not found</div>;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Versions</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage layout and seating scenarios</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => {
          if (!eventId) return;
          try {
            const versionId = `ver-${crypto.randomUUID().slice(0, 8)}`;
            const now = new Date().toISOString();
            const versionNumber = eventVersions.length + 1;
            addVersion({
              id: versionId,
              eventId,
              name: `Version ${versionNumber}`,
              status: 'draft',
              createdAt: now,
              updatedAt: now,
              createdBy: 'User',
              notes: '',
            });
            toast.success(`Created Version ${versionNumber}`);
          } catch {
            toast.error('Failed to create version');
          }
        }}><Plus className="w-4 h-4" />New Version</Button>
      </div>

      <div className="space-y-3">
        {eventVersions.map((version) => {
          const isActive = version.id === event.activeVersionId;
          const objects = layoutObjects.filter((o) => o.versionId === version.id);
          const seats = seatingAssignments.filter((a) => a.versionId === version.id);
          const tables = objects.filter((o) => ['round_table', 'rect_table'].includes(o.type));
          const config = statusConfig[version.status] || statusConfig.draft;
          const StatusIcon = config.icon;

          return (
            <div key={version.id} className={cn('glass-panel p-5', isActive && 'border-primary/40 ring-1 ring-primary/20')}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <GitBranch className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold text-foreground">{version.name}</h3>
                    <Badge variant="outline" className={config.color}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {version.status}
                    </Badge>
                    {isActive && <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">Active</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{version.notes}</p>
                  <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                    <span>{objects.length} objects</span>
                    <span>{tables.length} tables</span>
                    <span>{seats.length} seated</span>
                    <span className="font-mono">Updated {new Date(version.updatedAt).toLocaleDateString()}</span>
                    <span>by {version.createdBy}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
                    if (!eventId) return;
                    try {
                      const newId = `ver-${crypto.randomUUID().slice(0, 8)}`;
                      const now = new Date().toISOString();
                      addVersion({
                        id: newId,
                        eventId,
                        name: `${version.name} (Copy)`,
                        status: 'draft',
                        createdAt: now,
                        updatedAt: now,
                        createdBy: version.createdBy,
                        notes: version.notes,
                      });
                      toast.success(`Duplicated "${version.name}"`);
                    } catch {
                      toast.error('Failed to duplicate version');
                    }
                  }}><Copy className="w-3.5 h-3.5 mr-1" />Duplicate</Button>
                  {!isActive && <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                    if (!eventId) return;
                    updateEvent(eventId, { activeVersionId: version.id });
                    toast.success(`"${version.name}" is now active`);
                  }}>Set Active</Button>}
                </div>
              </div>
            </div>
          );
        })}
        {eventVersions.length === 0 && (
          <div className="glass-panel p-8 text-center space-y-3">
            <GitBranch className="w-8 h-8 text-muted-foreground mx-auto" />
            <h3 className="font-semibold text-foreground">No versions yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Create your first version to start designing layouts and seating arrangements for this event.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
