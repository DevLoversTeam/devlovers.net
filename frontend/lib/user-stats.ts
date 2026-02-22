import { getUserLastAttemptPerQuiz, getUserQuizStats } from '@/db/queries/quizzes/quiz';
import { getUserProfile } from '@/db/queries/users';
import { getSponsors, getAllSponsors } from '@/lib/about/github-sponsors';
import { checkHasStarredRepo, resolveGitHubLogin } from '@/lib/github-stars';
import { type UserStats } from '@/lib/achievements';

/**
 * Fetches and resolves all necessary dependencies to compute a user's `UserStats`
 * object required for evaluating achievements.
 */
export async function getUserStatsForAchievements(userId: string): Promise<UserStats | null> {
  const user = await getUserProfile(userId);
  if (!user) return null;

  const sponsors = await getSponsors();
  const allSponsors = await getAllSponsors();

  const userEmail = user.email.toLowerCase();
  const userName = (user.name ?? '').toLowerCase();
  const userImage = user.image ?? '';

  function findSponsor(list: typeof sponsors) {
    return list.find(s => {
      if (s.email && s.email.toLowerCase() === userEmail) return true;
      if (userName && s.login && s.login.toLowerCase() === userName) return true;
      if (userName && s.name && s.name.toLowerCase() === userName) return true;
      if (
        userImage &&
        s.avatarUrl &&
        s.avatarUrl.trim().length > 0 &&
        userImage.includes(s.avatarUrl.split('?')[0])
      ) return true;
      return false;
    });
  }

  const matchedSponsor = findSponsor(sponsors);
  const everSponsor = findSponsor(allSponsors);

  let githubLogin = matchedSponsor?.login || '';
  if (!githubLogin && user.provider === 'github' && user.providerId) {
    githubLogin = (await resolveGitHubLogin(user.providerId)) ?? user.name ?? '';
  } else if (!githubLogin) {
    githubLogin = user.name ?? '';
  }

  const hasStarredRepo = githubLogin ? await checkHasStarredRepo(githubLogin) : false;

  // We enforce the 'uk' locale here only for query syntax requirements, it doesn't affect raw stats.
  const attempts = await getUserQuizStats(userId);
  const lastAttempts = await getUserLastAttemptPerQuiz(userId, 'uk');

  const totalAttempts = attempts.length;

  const averageScore =
    lastAttempts.length > 0
      ? Math.round(
          lastAttempts.reduce((acc, curr) => acc + Number(curr.percentage), 0) /
            lastAttempts.length
        )
      : 0;

  const perfectScores = attempts.filter(a => Number(a.percentage) === 100).length;
  const highScores = attempts.filter(a => Number(a.percentage) >= 90).length;
  const uniqueQuizzes = lastAttempts.length;

  const hasNightOwl = attempts.some(a => {
    if (!a.completedAt) return false;
    const hour = new Date(a.completedAt).getHours();
    return hour >= 0 && hour < 5;
  });

  return {
    totalAttempts,
    averageScore,
    perfectScores,
    highScores,
    isSponsor: !!everSponsor,
    uniqueQuizzes,
    totalPoints: user.points,
    topLeaderboard: false, // Currently mocked or separate logic
    hasStarredRepo,
    sponsorCount: matchedSponsor ? 1 : 0, 
    hasNightOwl,
  };
}
