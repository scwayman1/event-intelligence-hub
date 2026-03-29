import { cn } from '@/lib/utils';
import { Pin, MessageSquare, Paperclip, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Message } from '@/types/messaging';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  threadCount?: number;
  onReply?: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onDelete?: () => void;
  onThreadClick?: () => void;
}

export function MessageBubble({
  message,
  isOwn,
  threadCount = 0,
  onReply,
  onPin,
  onUnpin,
  onDelete,
  onThreadClick,
}: MessageBubbleProps) {
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  // Parse @mentions in content — format: @[userId:displayName]
  const renderContent = (text: string) => {
    const parts = text.split(/(@\[[^\]]+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/@\[([^:]+):([^\]]+)\]/);
      if (match) {
        return (
          <span key={i} className="font-semibold text-violet-400">
            @{match[2]}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div
      className={cn(
        'group flex gap-3 px-4 py-1.5 hover:bg-muted/30 transition-colors',
        message.isPinned && 'bg-amber-500/5 border-l-2 border-amber-500/40',
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold mt-0.5',
          isOwn
            ? 'bg-violet-600/20 text-violet-400'
            : 'bg-emerald-600/20 text-emerald-400',
        )}
      >
        {message.senderName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)}
      </div>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-foreground">
            {message.senderName}
          </span>
          <span className="text-[10px] text-muted-foreground">{time}</span>
          {message.isPinned && (
            <Pin className="w-3 h-3 text-amber-500 fill-amber-500" />
          )}
          {message.editedAt && (
            <span className="text-[9px] text-muted-foreground italic">(edited)</span>
          )}
          {message.priority === 'urgent' && (
            <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">
              Urgent
            </span>
          )}
        </div>

        {/* Content */}
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
          {renderContent(message.content)}
        </p>

        {/* Attachments */}
        {message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1.5">
            {message.attachments.map((att) => (
              <a
                key={att.id}
                href={att.dataUrl}
                download={att.fileName}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground rounded-md border border-border/60 bg-muted/30 px-2 py-1 transition-colors"
              >
                <Paperclip className="w-3 h-3" />
                <span className="truncate max-w-[120px]">{att.fileName}</span>
                <span className="text-muted-foreground/50">
                  {att.fileSize > 1024 * 1024
                    ? `${(att.fileSize / (1024 * 1024)).toFixed(1)}MB`
                    : `${Math.round(att.fileSize / 1024)}KB`}
                </span>
              </a>
            ))}
          </div>
        )}

        {/* Thread indicator */}
        {threadCount > 0 && (
          <button
            onClick={onThreadClick}
            className="flex items-center gap-1.5 mt-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            {threadCount} {threadCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {/* Actions (visible on hover) */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex items-start gap-0.5 mt-0.5">
        {onReply && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onReply} title="Reply in thread">
            <MessageSquare className="w-3 h-3" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreHorizontal className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {message.isPinned ? (
              <DropdownMenuItem onClick={onUnpin}>Unpin message</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onPin}>Pin message</DropdownMenuItem>
            )}
            {isOwn && onDelete && (
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
