import { Link } from 'react-router-dom';
import { CalendarX, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EventNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted/60 border border-border/60 flex items-center justify-center mb-6">
        <CalendarX className="w-8 h-8 text-muted-foreground/70" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">Event not found</h2>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-6">
        This event may have been removed or the link is no longer valid. Head back to your events to continue.
      </p>
      <Button asChild variant="outline" size="sm" className="gap-2">
        <Link to="/">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to events
        </Link>
      </Button>
    </div>
  );
}
