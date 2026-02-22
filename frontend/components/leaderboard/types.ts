import type { Achievement } from '@/lib/achievements';

export interface User {
  id: number;
  userId: string;
  rank: number;
  username: string;
  points: number;
  avatar: string;
  change: number;
  isSponsor?: boolean;
  achievements?: Achievement[];
}

export interface CurrentUser {
  id: string;
  username: string;
}