import { useState, useMemo } from 'react';
import { useEventStore } from '@/data/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { collectAllTags } from '@/lib/rule-engine';
import type { SeatingRuleType, SeatingIntent } from '@/types/events';

interface CreateSeatingRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
}

const intentOptions: { value: SeatingIntent; label: string; description: string }[] = [
  { value: 'same_table', label: 'Same table', description: 'Seat these guests at the same table' },
  { value: 'nearby', label: 'Nearby', description: 'Seat these guests at adjacent tables' },
  { value: 'separate', label: 'Keep apart', description: 'Do not seat these guests together' },
];

export function CreateSeatingRuleDialog({ open, onOpenChange, eventId }: CreateSeatingRuleDialogProps) {
  const guests = useEventStore((s) => s.guests);
  const addSeatingRule = useEventStore((s) => s.addSeatingRule);
  const seatingRules = useEventStore((s) => s.seatingRules);

  const eventGuests = useMemo(() => guests.filter((g) => g.eventId === eventId), [guests, eventId]);
  const allTags = useMemo(() => collectAllTags(eventGuests), [eventGuests]);

  const [ruleType, setRuleType] = useState<SeatingRuleType>('same_tag');
  const [tag, setTag] = useState('');
  const [tagA, setTagA] = useState('');
  const [tagB, setTagB] = useState('');
  const [intent, setIntent] = useState<SeatingIntent>('same_table');
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');

  // Derive name/description from selections
  const derivedName = ruleType === 'same_tag'
    ? `${intent === 'separate' ? 'Separate' : 'Group'} "${tag}" guests`
    : ruleType === 'cross_tag'
      ? `${intent === 'same_table' ? 'Pair' : intent === 'separate' ? 'Separate' : 'Seat near'} "${tagA}" with "${tagB}"`
      : customName;

  const derivedDescription = ruleType === 'same_tag'
    ? `Guests tagged "${tag}" should be ${intent === 'same_table' ? 'at the same table' : intent === 'separate' ? 'at separate tables' : 'seated nearby'}.`
    : ruleType === 'cross_tag'
      ? `Guests tagged "${tagA}" should be ${intent === 'same_table' ? 'seated with' : intent === 'separate' ? 'kept apart from' : 'near'} guests tagged "${tagB}".`
      : customDescription;

  const canCreate = ruleType === 'same_tag'
    ? tag.length > 0
    : ruleType === 'cross_tag'
      ? tagA.length > 0 && tagB.length > 0 && tagA !== tagB
      : customName.length > 0;

  // Count guests matching each tag for preview
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allTags.forEach((t) => {
      counts.set(t, eventGuests.filter((g) => g.relationshipTags.includes(t)).length);
    });
    return counts;
  }, [allTags, eventGuests]);

  function handleCreate() {
    if (!canCreate) return;
    const nextPriority = seatingRules.filter((r) => r.eventId === eventId).length + 1;

    addSeatingRule({
      id: `sr-${crypto.randomUUID().slice(0, 8)}`,
      eventId,
      name: derivedName,
      description: derivedDescription,
      enabled: true,
      priority: nextPriority,
      ruleType,
      tag: ruleType === 'same_tag' ? tag : undefined,
      tagA: ruleType === 'cross_tag' ? tagA : undefined,
      tagB: ruleType === 'cross_tag' ? tagB : undefined,
      intent,
    });

    // Reset
    setTag('');
    setTagA('');
    setTagB('');
    setIntent('same_table');
    setCustomName('');
    setCustomDescription('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create seating rule</DialogTitle>
          <DialogDescription>
            Use tags to define who should sit together, nearby, or apart.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Rule type selector */}
          <div className="space-y-2">
            <Label>Rule type</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'same_tag' as const, label: 'Same tag', desc: 'Group by a single tag' },
                { value: 'cross_tag' as const, label: 'Cross-tag', desc: 'Link two different tags' },
                { value: 'custom' as const, label: 'Custom', desc: 'Manual rule description' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRuleType(opt.value)}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-all',
                    ruleType === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
                  )}
                >
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Tag selection */}
          {ruleType === 'same_tag' && (
            <div className="space-y-2">
              <Label>Select a tag</Label>
              {allTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTag(t)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all',
                        tag === t
                          ? 'bg-primary/15 border-primary/40 text-primary'
                          : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/30'
                      )}
                    >
                      {t}
                      <span className="text-[10px] opacity-70">{tagCounts.get(t)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">No tags found on guests. Type a new one:</p>
                  <Input
                    placeholder="e.g. thornton-family"
                    value={tag}
                    onChange={(e) => setTag(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  />
                </div>
              )}
              {allTags.length > 0 && (
                <Input
                  placeholder="Or type a new tag..."
                  value={allTags.includes(tag) ? '' : tag}
                  onChange={(e) => setTag(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  className="mt-2"
                />
              )}
            </div>
          )}

          {ruleType === 'cross_tag' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Tag A</Label>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTagA(t)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all',
                        tagA === t
                          ? 'bg-primary/15 border-primary/40 text-primary'
                          : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/30'
                      )}
                    >
                      {t}
                      <span className="text-[10px] opacity-70">{tagCounts.get(t)}</span>
                    </button>
                  ))}
                </div>
                {allTags.length === 0 && (
                  <Input placeholder="Tag A (e.g. thornton-scholar)" value={tagA} onChange={(e) => setTagA(e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
                )}
              </div>
              <div className="space-y-2">
                <Label>Tag B</Label>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTagB(t)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all',
                        tagB === t
                          ? 'bg-accent/15 border-accent/40 text-accent'
                          : 'bg-muted/50 border-border text-muted-foreground hover:border-accent/30'
                      )}
                    >
                      {t}
                      <span className="text-[10px] opacity-70">{tagCounts.get(t)}</span>
                    </button>
                  ))}
                </div>
                {allTags.length === 0 && (
                  <Input placeholder="Tag B (e.g. major-donor)" value={tagB} onChange={(e) => setTagB(e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
                )}
              </div>
            </div>
          )}

          {ruleType === 'custom' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Rule name</Label>
                <Input placeholder="e.g. Keep households together" value={customName} onChange={(e) => setCustomName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="Describe the rule..." value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} />
              </div>
            </div>
          )}

          {/* Intent selector */}
          {ruleType !== 'custom' && (
            <div className="space-y-2">
              <Label>Seating intent</Label>
              <div className="grid grid-cols-3 gap-2">
                {intentOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setIntent(opt.value)}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      intent === opt.value
                        ? opt.value === 'separate'
                          ? 'border-destructive bg-destructive/5'
                          : 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {canCreate && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-sm font-medium text-foreground">{derivedName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{derivedDescription}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!canCreate}>Create rule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
