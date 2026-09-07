import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * A coloured status pill.
 *
 * This exists because the same `bg-success/15 text-success` pattern had been
 * hand-written across five admin pages, and it was wrong in every one of them:
 * painting a colour's text on a 15% wash of itself *lowers* contrast rather
 * than raising it (4.82:1 on white, 3.95:1 on the tint), so every status badge
 * in the admin area failed WCAG AA. Defining the pairing once means the fix
 * lands everywhere and cannot drift back.
 *
 * The `*-tint-foreground` tokens are the same hues taken darker in light mode
 * and lighter in dark mode, chosen against the tint they actually sit on.
 */
export const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success/15 text-success-tint-foreground',
  warning: 'bg-warning/20 text-warning-tint-foreground',
  danger: 'bg-destructive/15 text-destructive-tint-foreground',
  info: 'bg-primary/12 text-primary',
  neutral: 'bg-muted text-muted-foreground',
};

/** For components that keep their own status -> style lookup table. */
export function toneClass(tone: StatusTone): string {
  return TONE_CLASSES[tone];
}

export function StatusBadge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn('border-transparent', TONE_CLASSES[tone], className)}>
      {children}
    </Badge>
  );
}
