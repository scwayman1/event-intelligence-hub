import { useState } from 'react';
import { useEventStore } from '@/data/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PRESET_COLORS = [
  'hsl(152 55% 48%)',
  'hsl(220 65% 52%)',
  'hsl(280 60% 55%)',
  'hsl(350 65% 52%)',
  'hsl(25 85% 55%)',
  'hsl(45 90% 50%)',
];

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrgDialog({ open, onOpenChange }: CreateOrgDialogProps) {
  const addOrganization = useEventStore((s) => s.addOrganization);
  const setActiveOrg = useEventStore((s) => s.setActiveOrg);

  const [orgName, setOrgName] = useState('');
  const [shortName, setShortName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);

  function handleCreate() {
    if (!orgName.trim()) return;
    const id = `org-${crypto.randomUUID().slice(0, 8)}`;
    addOrganization({
      id,
      name: orgName.trim(),
      shortName: shortName.trim() || orgName.trim().slice(0, 3).toUpperCase(),
      primaryColor: selectedColor,
      createdAt: new Date().toISOString(),
    });
    setActiveOrg(id);
    setOrgName('');
    setShortName('');
    setSelectedColor(PRESET_COLORS[0]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add organization</DialogTitle>
          <DialogDescription>Create a new school or institution with its own isolated events and data.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-org-name">Organization name</Label>
            <Input
              id="new-org-name"
              placeholder="e.g. Westlake Academy"
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                if (!shortName || shortName === orgName.slice(0, 3).toUpperCase()) {
                  setShortName(e.target.value.slice(0, 3).toUpperCase());
                }
              }}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-short-name">Short name</Label>
            <Input
              id="new-short-name"
              placeholder="e.g. WLA"
              maxLength={5}
              value={shortName}
              onChange={(e) => setShortName(e.target.value.toUpperCase())}
            />
          </div>

          <div className="space-y-2">
            <Label>Brand color</Label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className="w-8 h-8 rounded-full border-2 transition-all"
                  style={{
                    background: color,
                    borderColor: selectedColor === color ? 'hsl(var(--foreground))' : 'transparent',
                    transform: selectedColor === color ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!orgName.trim()}>Create organization</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
