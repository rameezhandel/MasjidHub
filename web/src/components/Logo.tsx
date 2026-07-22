import { cn } from '@/lib/utils';

/**
 * Rub el hizb mark: two overlapping squares (one rotated 45°) forming an
 * 8-point star, with a gold hub — one platform, many masjids.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn('size-7 text-primary', className)}>
      <rect x="9" y="9" width="22" height="22" rx="2.5" fill="currentColor" />
      <rect
        x="9"
        y="9"
        width="22"
        height="22"
        rx="2.5"
        fill="currentColor"
        transform="rotate(45 20 20)"
      />
      <circle cx="20" cy="20" r="4.6" fill="var(--gold)" />
    </svg>
  );
}

/** Mark + wordmark. "Masjid" in foreground, "Hub" in primary, Sora 800. */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={markClassName} />
      <span className="font-display text-lg font-extrabold tracking-[-0.03em]">
        Masjid<span className="text-primary">Hub</span>
      </span>
    </span>
  );
}
