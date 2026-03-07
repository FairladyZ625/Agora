/**
 * cn() — className merge utility
 * Lightweight alternative to clsx + tailwind-merge for simple cases
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
