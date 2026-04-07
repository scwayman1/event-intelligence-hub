import { useEffect, useState } from 'react';

const THINKING_PHRASES = [
  'Franck is thinking',
  'Franck consults his vision',
  'Franck arranges his thoughts',
  'Mon dieu, ze possibilities',
  'Franck contemplates',
  'Franck is having an idea',
  'Franck adjusts his bowtie',
];

interface Props {
  /** Optional override phrase (e.g. tool execution name) */
  override?: string | null;
}

export function FranckTypingIndicator({ override }: Props) {
  const [phraseIdx, setPhraseIdx] = useState(() => Math.floor(Math.random() * THINKING_PHRASES.length));

  useEffect(() => {
    if (override) return;
    const id = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % THINKING_PHRASES.length);
    }, 2800);
    return () => clearInterval(id);
  }, [override]);

  return (
    <div className="flex items-center gap-2">
      <span className="italic text-muted-foreground/90">
        {override ?? THINKING_PHRASES[phraseIdx]}
      </span>
      <span className="inline-flex items-end gap-[3px] h-3">
        <span className="franck-dot inline-block h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
        <span className="franck-dot inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
        <span className="franck-dot inline-block h-1.5 w-1.5 rounded-full bg-fuchsia-500" />
      </span>
    </div>
  );
}
