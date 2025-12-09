import { db } from './index';
import { users } from './schema/users';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const mockUsers = [
  {
    id: 'user_1',
    name: 'som-sm',
    points: 2535,
    role: 'user',
    email: 'som@test.com',
  },
  {
    id: 'user_2',
    name: 'sanjana',
    points: 2485,
    role: 'user',
    email: 'sanjana@test.com',
  },
  {
    id: 'user_3',
    name: 'satohshi',
    points: 2435,
    role: 'user',
    email: 'sat@test.com',
  },
  {
    id: 'user_4',
    name: 'Cristopher',
    points: 2385,
    role: 'user',
    email: 'cris@test.com',
  },
  {
    id: 'user_5',
    name: 'Saad Khan',
    points: 2335,
    role: 'user',
    email: 'saad@test.com',
  },
  {
    id: 'user_6',
    name: 'AlexDev',
    points: 2285,
    role: 'admin',
    email: 'alex@test.com',
  },
  {
    id: 'user_7',
    name: 'CodeMaster',
    points: 2235,
    role: 'user',
    email: 'code@test.com',
  },
];

async function main() {
  console.log('🌱 Seeding users...');

  try {
    for (const user of mockUsers) {
      await db.insert(users).values(user).onConflictDoNothing();
    }
    console.log('✅ Users seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding users:', error);
  } finally {
    process.exit(0);
  }
}

main();
