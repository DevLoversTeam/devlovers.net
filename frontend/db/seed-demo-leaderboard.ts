import { db } from './index';
import { users } from './schema/users';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Seeding demo leaderboard users...');

  const demoUsers = [
    {
      id: 'demo_1',
      name: 'CyberNinja',
      email: 'ninja@demo.com',
      image: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Felix',
      points: 1500,
    },
    {
      id: 'demo_2',
      name: 'CodeMaster',
      email: 'master@demo.com',
      image: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Aneka',
      points: 1200,
    },
    {
      id: 'demo_3',
      name: 'PixelArtist',
      email: 'pixel@demo.com',
      image: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Jude',
      points: 950,
    },
    {
      id: 'demo_4',
      name: 'BugHunter',
      email: 'bug@demo.com',
      points: 800,
    },
    {
      id: 'demo_5',
      name: 'DevOps_Guru',
      email: 'ops@demo.com',
      points: 600,
    },
  ];

  await db
    .insert(users)
    .values(
      demoUsers.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        points: u.points,
        role: 'user',
        createdAt: new Date(),
      }))
    )
    .onConflictDoUpdate({
      target: users.email,
      set: { points: sql`excluded.points` },
    });

  console.log('Demo users created!');
  process.exit(0);
}

main().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
