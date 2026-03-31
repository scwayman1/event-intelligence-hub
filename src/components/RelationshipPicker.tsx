import { useState, useMemo } from 'react';
import { useEventStore } from '@/data/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Link2, X, Users } from 'lucide-react';
import {
  type RelationshipType,
  type RelationshipGroup,
  RELATIONSHIP_TYPE_LABELS,
  RELATIONSHIP_TYPE_COLORS,
  RELATIONSHIP_ROLE_SUGGESTIONS,
} from '@/types/events';

const RELATIONSHIP_TYPES: RelationshipType[] = [
  'scholarship', 'mentorship', 'family', 'host_guest', 'sponsor', 'plus_one', 'custom',
];

interface RelationshipPickerProps {
  eventId: string;
  orgId: string;
  guestId?: string; // if editing an existing guest
  /** Called when memberships change. Returns array of { groupId, role } to apply. */
  selectedMemberships: Array<{ groupId: string; role: string }>;
  onMembershipsChange: (memberships: Array<{ groupId: string; role: string }>) => void;
}

export function RelationshipPicker({ eventId, orgId, selectedMemberships, onMembershipsChange }: RelationshipPickerProps) {
  const getEventRelationshipGroups = useEventStore((s) => s.getEventRelationshipGroups);
  const addRelationshipGroup = useEventStore((s) => s.addRelationshipGroup);
  const getGroupMembers = useEventStore((s) => s.getGroupMembers);

  const existingGroups = getEventRelationshipGroups(eventId);

  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<RelationshipType>('scholarship');
  const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null);
  const [roleInput, setRoleInput] = useState('');

  const selectClasses = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    const id = `rg-${crypto.randomUUID().slice(0, 8)}`;
    addRelationshipGroup({
      id,
      eventId,
      orgId,
      name: newGroupName.trim(),
      type: newGroupType,
      color: RELATIONSHIP_TYPE_COLORS[newGroupType],
      createdAt: new Date().toISOString(),
    });
    // Auto-open the "add to this group" flow
    setAddingToGroupId(id);
    setRoleInput(RELATIONSHIP_ROLE_SUGGESTIONS[newGroupType][0] || 'Member');
    setNewGroupName('');
    setShowCreate(false);
  }

  function handleAddToGroup(groupId: string, role: string) {
    if (!role.trim()) return;
    const already = selectedMemberships.find((m) => m.groupId === groupId);
    if (already) return; // already in this group
    onMembershipsChange([...selectedMemberships, { groupId, role: role.trim() }]);
    setAddingToGroupId(null);
    setRoleInput('');
  }

  function handleRemoveMembership(groupId: string) {
    onMembershipsChange(selectedMemberships.filter((m) => m.groupId !== groupId));
  }

  // Groups this guest is already in
  const selectedGroupIds = new Set(selectedMemberships.map((m) => m.groupId));
  const availableGroups = existingGroups.filter((g) => !selectedGroupIds.has(g.id));

  return (
    <div className="space-y-3">
      {/* Currently assigned relationship groups */}
      {selectedMemberships.length > 0 && (
        <div className="space-y-1.5">
          {selectedMemberships.map((m) => {
            const group = existingGroups.find((g) => g.id === m.groupId);
            if (!group) return null;
            const members = getGroupMembers(group.id);
            return (
              <div
                key={m.groupId}
                className="flex items-center gap-2 p-2 rounded-lg border bg-card"
                style={{ borderColor: `${group.color || 'hsl(var(--border))'}40` }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: group.color || 'hsl(var(--muted-foreground))' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{group.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {RELATIONSHIP_TYPE_LABELS[group.type]} &middot; Role: <span className="font-medium text-foreground">{m.role}</span>
                    {members.length > 0 && ` · ${members.length} member${members.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <button onClick={() => handleRemoveMembership(m.groupId)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Role assignment flow for a specific group */}
      {addingToGroupId && (
        <div className="p-2.5 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
          <p className="text-xs font-medium text-foreground">
            What is this guest's role in "{existingGroups.find((g) => g.id === addingToGroupId)?.name}"?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(() => {
              const group = existingGroups.find((g) => g.id === addingToGroupId);
              const suggestions = group ? RELATIONSHIP_ROLE_SUGGESTIONS[group.type] : ['Member'];
              return suggestions.map((r) => (
                <button
                  key={r}
                  onClick={() => handleAddToGroup(addingToGroupId, r)}
                  className="text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {r}
                </button>
              ));
            })()}
          </div>
          <div className="flex gap-1.5">
            <Input
              placeholder="Or type a custom role..."
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!roleInput.trim()) return; handleAddToGroup(addingToGroupId, roleInput); } }}
              className="h-7 text-xs"
            />
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs shrink-0" onClick={() => { setAddingToGroupId(null); setRoleInput(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Add to existing group */}
      {!addingToGroupId && availableGroups.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add to existing group</p>
          <div className="flex flex-wrap gap-1.5">
            {availableGroups.map((group) => (
              <button
                key={group.id}
                onClick={() => {
                  setAddingToGroupId(group.id);
                  setRoleInput(RELATIONSHIP_ROLE_SUGGESTIONS[group.type][0] || 'Member');
                }}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:border-primary/40 transition-colors"
                style={{ borderColor: `${group.color || 'hsl(var(--border))'}40` }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: group.color }} />
                {group.name}
                <span className="text-muted-foreground">({RELATIONSHIP_TYPE_LABELS[group.type]})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create new group */}
      {!addingToGroupId && !showCreate && (
        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => setShowCreate(true)}>
          <Plus className="w-3 h-3" />
          Create new relationship group
        </Button>
      )}

      {showCreate && (
        <div className="p-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 space-y-3">
          <p className="text-xs font-semibold text-foreground">New relationship group</p>

          <div className="space-y-1.5">
            <Label className="text-[11px]">Group name</Label>
            <Input
              placeholder="e.g. Scott Wehman Scholarship, Johnson Family"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateGroup(); } }}
              className="h-8 text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px]">Type</Label>
            <div className="flex flex-wrap gap-1.5">
              {RELATIONSHIP_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setNewGroupType(t)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    newGroupType === t
                      ? 'border-primary bg-primary/15 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  {RELATIONSHIP_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
              <Link2 className="w-3 h-3" />
              Create group
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
