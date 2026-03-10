import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}

export function stepTypeColor(type: string): string {
  switch (type) {
    case 'CLICK': return 'text-ds-accent';
    case 'WAIT': return 'text-ds-amber';
    case 'SNAP': return 'text-ds-emerald';
    case 'NAVIGATE': return 'text-ds-purple';
    case 'SCROLL': return 'text-ds-text-dim';
    default: return 'text-ds-text-muted';
  }
}

export function stepTypeBg(type: string): string {
  switch (type) {
    case 'CLICK': return 'bg-ds-accent/15 text-ds-accent border-ds-accent/30';
    case 'WAIT': return 'bg-ds-amber/15 text-ds-amber border-ds-amber/30';
    case 'SNAP': return 'bg-ds-emerald/15 text-ds-emerald border-ds-emerald/30';
    case 'NAVIGATE': return 'bg-ds-purple/15 text-ds-purple border-ds-purple/30';
    case 'SCROLL': return 'bg-ds-text-dim/15 text-ds-text-dim border-ds-text-dim/30';
    default: return 'bg-ds-surface text-ds-text-muted border-ds-border';
  }
}
