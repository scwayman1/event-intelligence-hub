import { validatePassword } from '@/lib/password-validation';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const checks = validatePassword(password);
  const metCount = checks.filter((c) => c.met).length;

  if (!password) return null;

  return (
    <div className="space-y-2 pt-1">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= metCount
                ? metCount <= 2
                  ? 'bg-destructive'
                  : metCount <= 4
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                : 'bg-muted',
            )}
          />
        ))}
      </div>

      {/* Check list */}
      <ul className="space-y-0.5">
        {checks.map((check) => (
          <li
            key={check.label}
            className={cn(
              'flex items-center gap-1.5 text-xs transition-colors',
              check.met ? 'text-emerald-500' : 'text-muted-foreground',
            )}
          >
            {check.met ? (
              <Check className="w-3 h-3 shrink-0" />
            ) : (
              <X className="w-3 h-3 shrink-0" />
            )}
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
