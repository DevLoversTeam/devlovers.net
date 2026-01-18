import { db } from '@/db'
import { users } from '@/db/schema/users'
import { quizAttempts } from '@/db/schema/quiz'
import { count } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'

export interface PlatformStats {
  githubStars: string
  linkedinFollowers: string
  activeUsers: string
  questionsSolved: string
}

const formatMetric = (n: number) => {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k+'
  return n.toString()
}

export const getPlatformStats = unstable_cache(
  async (): Promise<PlatformStats> => {
    // 1. GitHub
    let stars = 125
    try {
        const headers: HeadersInit = {}
        if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
        
        // Додаємо тип any для опцій fetch, щоб TS не лаявся на next.js розширення
        const res = await fetch('https://api.github.com/repos/DevLoversTeam/devlovers.net', { 
            headers, 
            next: { revalidate: 3600 } 
        } as RequestInit & { next?: { revalidate?: number } })
        
        if (res.ok) stars = (await res.json()).stargazers_count
    } catch (e) { console.error(e) }

    // 2. LinkedIn
    const linkedinCount = process.env.LINKEDIN_FOLLOWER_COUNT ? parseInt(process.env.LINKEDIN_FOLLOWER_COUNT) : 1342

    // 3. DB
    let totalUsers = 243
    let solvedTests = 1890
    try {
      const [u] = await db.select({ value: count() }).from(users)
      if (u) totalUsers = u.value
      const [q] = await db.select({ value: count() }).from(quizAttempts)
      if (q) solvedTests = q.value
    } catch (e) { 
        console.error("DB Fetch Error:", e) 
    }

    return {
      githubStars: formatMetric(stars),
      linkedinFollowers: formatMetric(linkedinCount),
      activeUsers: formatMetric(totalUsers),
      questionsSolved: formatMetric(solvedTests)
    }
  },
  ['platform-stats'],
  { revalidate: 3600 }
)