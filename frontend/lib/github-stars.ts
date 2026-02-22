import 'server-only';

const REPO_OWNER = 'DevLoversTeam';
const REPO_NAME = 'devlovers.net';
const MAX_PAGES = 10; // caps at 1000 stargazers

function getToken() {
  return process.env.GITHUB_SPONSORS_TOKEN;
}

function makeHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${getToken()}`,
  };
}

/**
 * Resolves a GitHub login (username) from a numeric provider ID.
 * Used when the user signed in via GitHub OAuth — the DB stores the numeric
 * `providerId`, but the stargazers API works with logins.
 */
export async function resolveGitHubLogin(providerId: string): Promise<string | null> {
  const token = getToken();
  if (!token || !providerId) return null;

  try {
    const res = await fetch(`https://api.github.com/user/${providerId}`, {
      headers: makeHeaders(),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data: { login?: string } = await res.json();
    return data.login ?? null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a given GitHub login has starred the DevLovers repo.
 * Uses the GITHUB_SPONSORS_TOKEN (server-side org PAT) — no user token needed.
 * Paginates through stargazers up to MAX_PAGES × 100 entries.
 */
export async function checkHasStarredRepo(
  githubLogin: string,
): Promise<boolean> {
  const token = getToken();
  if (!token || !githubLogin) return false;

  const loginLower = githubLogin.toLowerCase();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/stargazers?per_page=100&page=${page}`;

    try {
      const res = await fetch(url, {
        headers: makeHeaders(),
        next: { revalidate: 3600 }, // cache 1 hour per page
      });

      if (!res.ok) {
        console.warn(`⚠️ GitHub stargazers API error: ${res.status}`);
        return false;
      }

      const stargazers: { login: string }[] = await res.json();

      // Empty page = we've exhausted all stargazers
      if (stargazers.length === 0) return false;

      if (stargazers.some((s) => s.login.toLowerCase() === loginLower)) {
        return true;
      }

      // Last page (less than 100 results) — user not found
      if (stargazers.length < 100) return false;
    } catch (err) {
      console.error('❌ Failed to check GitHub stargazers:', err);
      return false;
    }
  }

  return false;
}
