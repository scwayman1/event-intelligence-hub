import { cn } from '@/lib/utils';

interface AvatarProps {
  initials: string;
  color: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ initials, color, size = 'sm', className }: AvatarProps) {
  const sizeClasses = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs';

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none',
        sizeClasses,
        className
      )}
      style={{ backgroundColor: color }}
      title={initials}
    >
      {initials}
    </span>
  );
}

const teamMembers = [
  { initials: 'EM', color: '#6366f1' },
  { initials: 'SK', color: '#ec4899' },
  { initials: 'JD', color: '#f59e0b' },
];

export function TeamAvatarStack() {
  return (
    <div className="flex items-center" title="3 team members">
      <div className="flex -space-x-2">
        {teamMembers.map((member) => (
          <Avatar
            key={member.initials}
            initials={member.initials}
            color={member.color}
            size="sm"
            className="ring-2 ring-sidebar"
          />
        ))}
      </div>
      <span className="ml-1.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-sidebar-accent text-[10px] font-medium text-sidebar-foreground/60 ring-2 ring-sidebar -ml-2">
        +2
      </span>
    </div>
  );
}
