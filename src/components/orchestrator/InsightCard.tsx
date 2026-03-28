import { Users, LayoutGrid, Mail, MapPin, AlertTriangle, X, Lightbulb, CheckCircle2, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OrchestratorInsight, InsightPriority, InsightCategory } from '@/types/orchestrator';

export interface InsightCardProps {
  insight: OrchestratorInsight;
  onAction?: (insight: OrchestratorInsight) => void;
  onDismiss?: (id: string) => void;
}

const PRIORITY_STYLES: Record<InsightPriority, { border: string; badge: string; badgeText: string }> = {
  critical: {
    border: 'border-l-rose-500',
    badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
    badgeText: 'Critical',
  },
  high: {
    border: 'border-l-orange-500',
    badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
    badgeText: 'High',
  },
  medium: {
    border: 'border-l-blue-500',
    badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
    badgeText: 'Medium',
  },
  low: {
    border: 'border-l-gray-400',
    badge: 'bg-gray-500/15 text-gray-500 dark:text-gray-400 border-gray-500/30',
    badgeText: 'Low',
  },
};

const CATEGORY_ICONS: Record<InsightCategory, React.ReactNode> = {
  guests: <Users className="w-4 h-4" />,
  seating: <LayoutGrid className="w-4 h-4" />,
  layout: <MapPin className="w-4 h-4" />,
  communications: <Mail className="w-4 h-4" />,
  logistics: <AlertTriangle className="w-4 h-4" />,
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  alert: <AlertTriangle className="w-3.5 h-3.5" />,
  recommendation: <Lightbulb className="w-3.5 h-3.5" />,
  milestone: <CheckCircle2 className="w-3.5 h-3.5" />,
  action_needed: <Zap className="w-3.5 h-3.5" />,
};

export function InsightCard({ insight, onAction, onDismiss }: InsightCardProps) {
  const priority = PRIORITY_STYLES[insight.priority];
  const categoryIcon = CATEGORY_ICONS[insight.category];

  return (
    <div
      className={cn(
        'relative rounded-lg border border-border bg-card/80 backdrop-blur-sm',
        'border-l-4 p-4 transition-all duration-200',
        'hover:shadow-md hover:bg-card',
        priority.border,
      )}
    >
      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={() => onDismiss(insight.id)}
          className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="flex items-start gap-3 pr-6">
        {/* Category icon */}
        <div className="mt-0.5 p-1.5 rounded-md bg-muted/50 text-muted-foreground shrink-0">
          {categoryIcon}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', priority.badge)}>
              {priority.badgeText}
            </Badge>
            <span className="text-muted-foreground">{TYPE_ICONS[insight.type]}</span>
          </div>

          {/* Title + description */}
          <div>
            <p className="text-sm font-semibold text-foreground">{insight.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {insight.description}
            </p>
          </div>

          {/* Action button */}
          {insight.actionLabel && onAction && (
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs gap-1.5"
              onClick={() => onAction(insight)}
            >
              <Zap className="w-3 h-3" />
              {insight.actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
