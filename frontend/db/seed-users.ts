import { db } from './index';
import { users } from './schema/users';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const mockUsers = [
   {
    id: 'test-user-123',
    name: 'Test User',
    points: 0,
    role: 'user',
    email: 'test@test.com',
  },
  {
    id: 'user_1',
    name: 'som-sm',
    points: 0,
    role: 'user',
    email: 'som@test.com',
  },
  {
    id: 'user_2',
    name: 'sanjana',
    points: 0,
    role: 'user',
    email: 'sanjana@test.com',
  },
  {
    id: 'user_3',
    name: 'satohshi',
    points: 0,
    role: 'user',
    email: 'sat@test.com',
  },
  {
    id: 'user_4',
    name: 'Cristopher',
    points: 0,
    role: 'user',
    email: 'cris@test.com',
  },
  {
    id: 'user_5',
    name: 'Saad Khan',
    points: 0,
    role: 'user',
    email: 'saad@test.com',
  },
  {
    id: 'user_6',
    name: 'AlexDev',
    points: 0,
    role: 'admin',
    email: 'alex@test.com',
  },
  {
    id: 'user_7',
    name: 'CodeMaster',
    points: 0,
    role: 'user',
    email: 'code@test.com',
  },
];

async function main() {
  console.log('🌱 Seeding users...');

  try {
    for (const user of mockUsers) {
      await db
  .insert(users)
  .values(user)
  .onConflictDoUpdate({
    target: users.email,
    set: {
      points: user.points,
      name: user.name,
      role: user.role,
    },
  });
    }
    console.log('✅ Users seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding users:', error);
  } finally {
    process.exit(0);
  }
}

main();
