export type AchievementIconName =
  | 'Fire'
  | 'Target'
  | 'Lightning'
  | 'Brain'
  | 'Diamond'
  | 'Star'
  | 'Heart'
  | 'Trophy'
  | 'Rocket'
  | 'Crown'
  | 'Code'
  | 'Infinity'
  // batch 2
  | 'GithubLogo'
  | 'Medal'
  | 'Seal'
  | 'Moon'
  | 'Shield'
  | 'Waves';

export interface Achievement {
  id: string;
  icon: AchievementIconName;
  /** gradient colors for the badge circle [from, to] */
  gradient: [string, string];
  /** glow color (css color) */
  glow: string;
}

export interface EarnedAchievement extends Achievement {
  earned: boolean;
  /** 0–100, only meaningful when earned === false */
  progress?: number;
  /** Date string when the achievement was earned */
  earnedAt?: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ── Group 1: Quiz progression (attempts & points) ─────────────────
  {
    id: 'first_blood',
    icon: 'Fire',
    gradient: ['#f97316', '#ef4444'],
    glow: 'rgba(249,115,22,0.55)',
  },
  {
    id: 'on_a_roll',
    icon: 'Lightning',
    gradient: ['#eab308', '#f59e0b'],
    glow: 'rgba(234,179,8,0.55)',
  },
  {
    id: 'rocket_start',
    icon: 'Rocket',
    gradient: ['#10b981', '#059669'],
    glow: 'rgba(16,185,129,0.55)',
  },
  {
    id: 'big_brain',
    icon: 'Brain',
    gradient: ['#06b6d4', '#3b82f6'],
    glow: 'rgba(6,182,212,0.55)',
  },
  {
    id: 'centurion',
    icon: 'Shield',
    gradient: ['#10b981', '#14b8a6'],
    glow: 'rgba(16,185,129,0.6)',
  },
  {
    id: 'endless',
    icon: 'Infinity',
    gradient: ['#14b8a6', '#0ea5e9'],
    glow: 'rgba(20,184,166,0.55)',
  },

  // ── Group 2: Skill / accuracy ──────────────────────────────────────
  {
    id: 'sharpshooter',
    icon: 'Target',
    gradient: ['#6366f1', '#8b5cf6'],
    glow: 'rgba(99,102,241,0.55)',
  },
  {
    id: 'perfectionist',
    icon: 'Star',
    gradient: ['#f59e0b', '#fbbf24'],
    glow: 'rgba(251,191,36,0.55)',
  },
  {
    id: 'diamond_mind',
    icon: 'Diamond',
    gradient: ['#67e8f9', '#a78bfa'],
    glow: 'rgba(167,139,250,0.55)',
  },
  {
    id: 'deep_diver',
    icon: 'Waves',
    gradient: ['#0ea5e9', '#6366f1'],
    glow: 'rgba(14,165,233,0.6)',
  },
  {
    id: 'code_wizard',
    icon: 'Code',
    gradient: ['#8b5cf6', '#6366f1'],
    glow: 'rgba(139,92,246,0.55)',
  },
  {
    id: 'legend',
    icon: 'Trophy',
    gradient: ['#d97706', '#b45309'],
    glow: 'rgba(217,119,6,0.55)',
  },

  // ── Group 3: Social / special / sponsor ───────────────────────────
  {
    id: 'royalty',
    icon: 'Crown',
    gradient: ['#f59e0b', '#dc2626'],
    glow: 'rgba(245,158,11,0.55)',
  },
  {
    id: 'night_owl',
    icon: 'Moon',
    gradient: ['#6366f1', '#8b5cf6'],
    glow: 'rgba(99,102,241,0.6)',
  },
  {
    id: 'star_gazer',
    icon: 'GithubLogo',
    gradient: ['#fbbf24', '#f59e0b'],
    glow: 'rgba(251,191,36,0.7)',
  },
  {
    id: 'supporter',
    icon: 'Heart',
    gradient: ['#ec4899', '#f43f5e'],
    glow: 'rgba(236,72,153,0.55)',
  },
  {
    id: 'silver_patron',
    icon: 'Medal',
    gradient: ['#94a3b8', '#e2e8f0'],
    glow: 'rgba(148,163,184,0.6)',
  },
  {
    id: 'golden_patron',
    icon: 'Seal',
    gradient: ['#f59e0b', '#b45309'],
    glow: 'rgba(245,158,11,0.7)',
  },
];

export interface UserStats {
  totalAttempts: number;
  averageScore: number;
  perfectScores: number;
  highScores: number;
  isSponsor: boolean;
  uniqueQuizzes: number;
  totalPoints: number;
  topLeaderboard: boolean;
  hasStarredRepo: boolean;
  sponsorCount: number;
  hasNightOwl: boolean;
}

export function computeAchievements(stats: UserStats): EarnedAchievement[] {
  return ACHIEVEMENTS.map(a => {
    let earned = false;
    let progress = 0;

    switch (a.id) {
      case 'first_blood':
        earned = stats.totalAttempts >= 1;
        progress = earned ? 100 : 0;
        break;
      case 'sharpshooter':
        earned = stats.perfectScores >= 1;
        progress = earned ? 100 : 0;
        break;
      case 'royalty':
        earned = stats.topLeaderboard;
        progress = earned ? 100 : 0;
        break;
      case 'supporter':
        earned = stats.isSponsor;
        progress = earned ? 100 : 0;
        break;
      case 'star_gazer':
        earned = stats.hasStarredRepo;
        progress = earned ? 100 : 0;
        break;
      case 'night_owl':
        earned = stats.hasNightOwl;
        progress = earned ? 100 : 0;
        break;

      case 'on_a_roll':
        earned = stats.totalAttempts >= 3;
        progress = Math.min((stats.totalAttempts / 3) * 100, 100);
        break;
      case 'big_brain':
        earned = stats.totalAttempts >= 10;
        progress = Math.min((stats.totalAttempts / 10) * 100, 100);
        break;
      case 'rocket_start':
        earned = stats.totalAttempts >= 5;
        progress = Math.min((stats.totalAttempts / 5) * 100, 100);
        break;
      case 'diamond_mind':
        earned = stats.highScores >= 5;
        progress = Math.min((stats.highScores / 5) * 100, 100);
        break;
      case 'perfectionist':
        earned = stats.perfectScores >= 3;
        progress = Math.min((stats.perfectScores / 3) * 100, 100);
        break;
      case 'legend':
        earned = stats.uniqueQuizzes >= 10;
        progress = Math.min((stats.uniqueQuizzes / 10) * 100, 100);
        break;
      case 'code_wizard':
        earned = stats.uniqueQuizzes >= 5;
        progress = Math.min((stats.uniqueQuizzes / 5) * 100, 100);
        break;
      case 'endless':
        earned = stats.totalPoints >= 1000;
        progress = Math.min((stats.totalPoints / 1000) * 100, 100);
        break;
      case 'centurion':
        earned = stats.totalPoints >= 100;
        progress = Math.min((stats.totalPoints / 100) * 100, 100);
        break;
      case 'golden_patron':
        earned = stats.sponsorCount >= 3;
        progress = Math.min((stats.sponsorCount / 3) * 100, 100);
        break;

      case 'silver_patron':
        earned = stats.sponsorCount >= 2;
        progress =
          stats.sponsorCount >= 2 ? 100 : stats.sponsorCount >= 1 ? 50 : 0;
        break;

      case 'deep_diver':
        earned = stats.totalAttempts >= 10 && stats.averageScore >= 80;
        progress =
          stats.totalAttempts < 10
            ? Math.min((stats.totalAttempts / 10) * 100, 100)
            : Math.min((stats.averageScore / 80) * 100, 100);
        break;

      default:
        earned = false;
        progress = 0;
    }

    return {
      ...a,
      earned,
      progress,
      earnedAt: undefined,
    };
  });
}
