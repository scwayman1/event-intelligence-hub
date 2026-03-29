import { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MessageAttachment, MessagePriority } from '@/types/messaging';

interface MessageInputProps {
  onSend: (content: string, attachments: MessageAttachment[], priority: MessagePriority) => void;
  placeholder?: string;
  participants?: { id: string; name: string }[];
  disabled?: boolean;
}

export function MessageInput({
  onSend,
  placeholder = 'Type a message...',
  participants = [],
  disabled,
}: MessageInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [priority, setPriority] = useState<MessagePriority>('normal');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content && attachments.length === 0) return;
    onSend(content, attachments, priority);
    setText('');
    setAttachments([]);
    setPriority('normal');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, attachments, priority, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setShowMentions(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;

    // @mention detection
    const cursorPos = ta.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch && participants.length > 0) {
      setShowMentions(true);
      setMentionFilter(atMatch[1].toLowerCase());
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (participant: { id: string; name: string }) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursorPos = ta.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPos);
    const textAfterCursor = text.slice(cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const before = text.slice(0, atIndex);
    const mention = `@[${participant.id}:${participant.name}] `;
    setText(before + mention + textAfterCursor);
    setShowMentions(false);
    ta.focus();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) continue; // Skip >5MB
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      setAttachments((prev) => [
        ...prev,
        {
          id: crypto.randomUUID().slice(0, 8),
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          dataUrl,
        },
      ]);
    }
    e.target.value = '';
  };

  const filteredParticipants = participants.filter((p) =>
    p.name.toLowerCase().includes(mentionFilter),
  );

  return (
    <div className="relative">
      {/* @mention popup */}
      {showMentions && filteredParticipants.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden z-50">
          {filteredParticipants.slice(0, 6).map((p) => (
            <button
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(p); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors flex items-center gap-2"
            >
              <div className="w-6 h-6 rounded-full bg-violet-600/20 text-violet-400 flex items-center justify-center text-[10px] font-bold">
                {p.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </div>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Attachment preview */}
      {attachments.length > 0 && (
        <div className="flex gap-2 px-3 py-2 flex-wrap">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="inline-flex items-center gap-1.5 text-[11px] rounded-md border border-border bg-muted/30 px-2 py-1"
            >
              <Paperclip className="w-3 h-3 text-muted-foreground" />
              <span className="truncate max-w-[100px]">{att.fileName}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                className="text-muted-foreground hover:text-destructive ml-1"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 px-3 py-2 border-t border-border bg-card/50">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8 shrink-0', priority === 'urgent' && 'text-red-400')}
          onClick={() => setPriority(priority === 'urgent' ? 'normal' : 'urgent')}
          title={priority === 'urgent' ? 'Remove urgent' : 'Mark urgent'}
        >
          <AlertTriangle className="w-4 h-4" />
        </Button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent text-sm leading-relaxed',
            'placeholder:text-muted-foreground/50 focus:outline-none',
            'max-h-[120px] py-1.5',
          )}
        />
        <Button
          size="icon"
          className="h-8 w-8 shrink-0 rounded-lg bg-violet-600 hover:bg-violet-700"
          onClick={handleSend}
          disabled={disabled || (!text.trim() && attachments.length === 0)}
        >
          <Send className="w-4 h-4 text-white" />
        </Button>
      </div>
    </div>
  );
}
