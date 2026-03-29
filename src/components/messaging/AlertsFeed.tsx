import { cn } from '@/lib/utils';
import { useEventStore } from '@/data/store';
import { Button } from '@/components/ui/button';
import {
  Bell,
  CheckCheck,
  Users,
  AlertTriangle,
  Calendar,
  Info,
  Zap,
  Armchair,
} from 'lucide-react';
import type { SystemAlertType, MessagePriority } from '@/types/messaging';

const alertTypeConfig: Record<SystemAlertType, { icon: React.ReactNode; color: string }> = {
  rsvp_update: { icon: <Users className="w-4 h-4" />, color: 'text-emerald-400' },
  capacity_warning: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-amber-400' },
  task_assignment: { icon: <Zap className="w-4 h-4" />, color: 'text-violet-400' },
  deadline: { icon: <Calendar className="w-4 h-4" />, color: 'text-red-400' },
  seating_change: { icon: <Armchair className="w-4 h-4" />, color: 'text-blue-400' },
  error: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-400' },
  info: { icon: <Info className="w-4 h-4" />, color: 'text-blue-400' },
};

const priorityBorder: Record<MessagePriority, string> = {
  low: 'border-border',
  normal: 'border-border',
  high: 'border-amber-500/30',
  urgent: 'border-red-500/30',
};

export function AlertsFeed() {
  const alerts = useEventStore((s) => s.systemAlerts);
  const markAlertRead = useEventStore((s) => s.markAlertRead);
  const markAllAlertsRead = useEventStore((s) => s.markAllAlertsRead);

  const sorted = [...alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unreadCount = alerts.filter((a) => !a.isRead).length;

  if (alerts.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">No alerts</p>
        <p className="text-xs text-muted-foreground/60">
          System notifications will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      {unreadCount > 0 && (
        <div className="flex items-center justify-between pb-2">
          <span className="text-xs text-muted-foreground">
            {unreadCount} unread alert{unreadCount !== 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={markAllAlertsRead}
          >
            <CheckCheck className="w-3 h-3" /> Mark all read
          </Button>
        </div>
      )}

      {sorted.map((alert) => {
        const config = alertTypeConfig[alert.type];
        return (
          <button
            key={alert.id}
            onClick={() => !alert.isRead && markAlertRead(alert.id)}
            className={cn(
              'w-full text-left rounded-lg border p-3 transition-all',
              priorityBorder[alert.priority],
              alert.isRead
                ? 'bg-card/30 opacity-60'
                : 'bg-card/50 hover:bg-muted/30',
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn('shrink-0 mt-0.5', config.color)}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn('text-[13px] font-medium', !alert.isRead && 'text-foreground')}>
                    {alert.title}
                  </p>
                  {!alert.isRead && (
                    <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                  )}
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed mt-0.5">
                  {alert.message}
                </p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  {new Date(alert.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
