import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Copy, Check, Clock, Archive, GitBranch, GitCommit, Layers, Users, FileText, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EventNotFound } from '@/components/EventNotFound';
import type { VersionStatus } from '@/types/events';

const statusConfig: Record<VersionStatus, { label: string; color: string; dot: string; icon: React.ElementType }> = {
  active: { label: 'Active', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400', icon: Check },
  draft: { label: 'Draft', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30', dot: 'bg-zinc-400', icon: Clock },
  approved: { label: 'Approved', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', dot: 'bg-blue-400', icon: Check },
  archived: { label: 'Archived', color: 'bg-zinc-700/20 text-zinc-500 border-zinc-700/30', dot: 'bg-zinc-600', icon: Archive },
};

export default function EventVersions() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const versions = useEventStore((s) => s.versions);
  const addVersion = useEventStore((s) => s.addVersion);
  const updateVersion = useEventStore((s) => s.updateVersion);
  const updateEvent = useEventStore((s) => s.updateEvent);
  const addLayoutObject = useEventStore((s) => s.addLayoutObject);
  const getVersionObjects = useEventStore((s) => s.getVersionObjects);
  const getVersionSeating = useEventStore((s) => s.getVersionSeating);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const event = events.find((e) => e.id === eventId);
  const eventVersions = versions
    .filter((v) => v.eventId === eventId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleCreateVersion = useCallback(() => {
    if (!event) return;
    const now = new Date().toISOString();
    const newId = `ver-${crypto.randomUUID().slice(0, 8)}`;
    const activeObjects = getVersionObjects(event.activeVersionId);
    const versionCount = eventVersions.length + 1;

    addVersion({
      id: newId,
      eventId: event.id,
      name: `Version ${versionCount}`,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      createdBy: 'Current User',
      notes: 'Duplicated from active version',
    });

    // Duplicate layout objects from active version
    activeObjects.forEach((obj) => {
      addLayoutObject({
        ...obj,
        id: `obj-${crypto.randomUUID().slice(0, 8)}`,
        versionId: newId,
      });
    });
    toast.success('Version created');
  }, [event, eventVersions.length, getVersionObjects, addVersion, addLayoutObject]);

  const handleDuplicate = useCallback((sourceVersionId: string, sourceName: string) => {
    if (!event) return;
    const now = new Date().toISOString();
    const newId = `ver-${crypto.randomUUID().slice(0, 8)}`;
    const sourceObjects = getVersionObjects(sourceVersionId);

    addVersion({
      id: newId,
      eventId: event.id,
      name: `${sourceName} (copy)`,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      createdBy: 'Current User',
      notes: `Duplicated from "${sourceName}"`,
    });

    sourceObjects.forEach((obj) => {
      addLayoutObject({
        ...obj,
        id: `obj-${crypto.randomUUID().slice(0, 8)}`,
        versionId: newId,
      });
    });
    toast.success('Version duplicated');
  }, [event, getVersionObjects, addVersion, addLayoutObject]);

  const handleSetActive = useCallback((versionId: string) => {
    if (!event) return;
    // Mark old active version as approved
    const oldActive = versions.find((v) => v.id === event.activeVersionId);
    if (oldActive) {
      updateVersion(oldActive.id, { status: 'approved', updatedAt: new Date().toISOString() });
    }
    // Set new active
    updateVersion(versionId, { status: 'active', updatedAt: new Date().toISOString() });
    updateEvent(event.id, { activeVersionId: versionId, updatedAt: new Date().toISOString() });
    const activatedVersion = versions.find((v) => v.id === versionId);
    toast.success(`Active version changed to ${activatedVersion?.name ?? 'selected version'}`);
  }, [event, versions, updateVersion, updateEvent]);

  const handleStartEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const handleSaveEdit = (id: string) => {
    if (editName.trim()) {
      updateVersion(id, { name: editName.trim(), updatedAt: new Date().toISOString() });
    }
    setEditingId(null);
  };

  if (!event) return <EventNotFound />;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20">
                <GitBranch className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Version History</h1>
                <p className="text-sm text-muted-foreground">{event.name}</p>
              </div>
            </div>
          </div>
          <Button onClick={handleCreateVersion} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" />
            New Version
          </Button>
        </div>
      </div>

      {/* Version comparison hint */}
      <Card className="mb-8 border-dashed border-muted-foreground/20 bg-muted/30">
        <div className="p-5 flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted shrink-0">
            <Layers className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">Compare Versions</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Select two versions to compare layout differences, seating changes, and object modifications
            </p>
          </div>
          <Button variant="outline" size="sm" disabled className="text-xs gap-1.5 opacity-60">
            <ArrowRight className="w-3.5 h-3.5" />
            Coming soon
          </Button>
        </div>
      </Card>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical timeline line */}
        {eventVersions.length > 1 && (
          <div className="absolute left-[23px] top-8 bottom-8 w-px bg-gradient-to-b from-primary/40 via-border to-border" />
        )}

        <div className="space-y-4">
          {eventVersions.map((version, index) => {
            const isActive = version.id === event.activeVersionId;
            const isArchived = version.status === 'archived';
            const isDraft = version.status === 'draft';
            const objects = getVersionObjects(version.id);
            const seats = getVersionSeating(version.id);
            const tables = objects.filter((o) => ['round_table', 'rect_table'].includes(o.type));
            const config = statusConfig[version.status] || statusConfig.draft;
            const StatusIcon = config.icon;
            const isEditing = editingId === version.id;

            return (
              <div key={version.id} className="relative flex gap-5">
                {/* Timeline node */}
                <div className="relative z-10 shrink-0 flex flex-col items-center pt-6">
                  <div
                    className={cn(
                      'flex items-center justify-center rounded-full border-2 transition-all',
                      isActive
                        ? 'w-12 h-12 bg-primary/15 border-primary shadow-lg shadow-primary/20'
                        : isArchived
                          ? 'w-10 h-10 bg-muted/50 border-zinc-700/40'
                          : 'w-10 h-10 bg-card border-border',
                    )}
                  >
                    <GitCommit
                      className={cn(
                        'transition-colors',
                        isActive ? 'w-5 h-5 text-primary' : isArchived ? 'w-4 h-4 text-zinc-600' : 'w-4 h-4 text-muted-foreground',
                      )}
                    />
                  </div>
                  {index === 0 && isActive && (
                    <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">Live</span>
                  )}
                </div>

                {/* Version card */}
                <Card
                  className={cn(
                    'flex-1 transition-all duration-200',
                    isActive && 'border-primary/40 shadow-lg shadow-primary/5 ring-1 ring-primary/10',
                    isArchived && 'opacity-55 hover:opacity-75',
                    isDraft && 'opacity-80 hover:opacity-100',
                    !isActive && !isArchived && !isDraft && 'hover:border-border/80',
                  )}
                >
                  <div className="p-5">
                    {/* Card header row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1">
                          {isEditing ? (
                            <input
                              autoFocus
                              className="text-lg font-semibold text-foreground bg-transparent border-b border-primary/40 outline-none px-0 py-0.5 w-48"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onBlur={() => handleSaveEdit(version.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(version.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                            />
                          ) : (
                            <h3
                              className="text-lg font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
                              onClick={() => handleStartEdit(version.id, version.name)}
                              title="Click to rename"
                            >
                              {version.name}
                            </h3>
                          )}

                          <Badge variant="outline" className={cn('text-[11px] font-medium gap-1 px-2', config.color)}>
                            <StatusIcon className="w-3 h-3" />
                            {config.label}
                          </Badge>

                          {isActive && (
                            <Badge className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0 h-5 shadow-sm">
                              Active
                            </Badge>
                          )}
                        </div>

                        {/* Notes preview */}
                        {version.notes && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2 flex items-start gap-1.5">
                            <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50" />
                            {version.notes}
                          </p>
                        )}

                        {/* Stats row */}
                        <div className="flex items-center gap-5 mt-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Layers className="w-3.5 h-3.5 opacity-60" />
                            <span className="font-medium text-foreground/80">{objects.length}</span>
                            <span>objects</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="w-2 h-2 rounded-full bg-amber-400/60" />
                            <span className="font-medium text-foreground/80">{tables.length}</span>
                            <span>tables</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Users className="w-3.5 h-3.5 opacity-60" />
                            <span className="font-medium text-foreground/80">{seats.length}</span>
                            <span>seated</span>
                          </div>
                          <span className="text-[11px] text-muted-foreground/60 ml-auto">
                            Created {new Date(version.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {' by '}
                            <span className="text-muted-foreground/80">{version.createdBy}</span>
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs gap-1.5 h-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleDuplicate(version.id, version.name)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Duplicate
                        </Button>
                        {!isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1.5 h-8 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                            onClick={() => handleSetActive(version.id)}
                          >
                            <Check className="w-3.5 h-3.5" />
                            Set Active
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {eventVersions.length === 0 && (
          <Card className="border-dashed">
            <div className="p-12 text-center">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/50 mx-auto mb-4">
                <GitBranch className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">No versions yet</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Create your first version to start designing layouts and managing seating arrangements.
              </p>
              <Button onClick={handleCreateVersion} className="gap-2">
                <Plus className="w-4 h-4" />
                Create First Version
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
