import { Link2 } from 'lucide-react';
import { RELATIONSHIP_TYPE_LABELS, type RelationshipGroup } from '@/types/events';

interface RelationshipBadgeProps {
  group: RelationshipGroup;
  role: string;
  onClick?: () => void;
}

export function RelationshipBadge({ group, role, onClick }: RelationshipBadgeProps) {
  const color = group.color || 'hsl(var(--muted-foreground))';
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[10px] leading-tight px-2 py-0.5 rounded-full border transition-colors hover:opacity-80"
      style={{
        borderColor: `${color}40`,
        background: `${color}12`,
        color: color,
      }}
      title={`${RELATIONSHIP_TYPE_LABELS[group.type]}: ${group.name} (${role})`}
    >
      <Link2 className="w-2.5 h-2.5 shrink-0" />
      <span className="font-medium truncate max-w-[120px]">{group.name}</span>
      <span className="opacity-70">{role}</span>
    </button>
  );
}
