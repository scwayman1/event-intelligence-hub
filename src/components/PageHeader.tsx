import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { ChevronRight } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const event = events.find((e) => e.id === eventId);

  return (
    <div className="mb-8">
      {event && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <span className="truncate max-w-[200px]">{event.name}</span>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="text-foreground font-medium">{title}</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
