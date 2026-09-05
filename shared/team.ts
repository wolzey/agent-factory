import type { AvatarConfig } from './types.js';

export interface TeamMember {
  id: string;
  name: string;
  avatar: AvatarConfig;
  lastSeen: number;
  online: boolean;
  agents: number;
}
export type StoredTeamMember = Omit<TeamMember, 'online' | 'agents'>;
export interface TeamSnapshot { members: TeamMember[]; serverTime: number; historyAvailable: boolean }

export function lastSeenLabel(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return 'last here just now';
  if (minutes < 60) return `last here ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `last here ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `last here ${days}d ago`;
  return `last here ${new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
