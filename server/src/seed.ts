import bcrypt from 'bcryptjs';
import { connectDB } from './config/db';
import { User } from './models/User';

async function seed() {
  await connectDB();
  const email = process.env.SEED_EMAIL || 'demo@eventpilot.local';
  const password = process.env.SEED_PASSWORD || 'ChangeMe123!';
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`[seed] User already exists: ${email}`);
    process.exit(0);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ name: 'EventPilot Demo', email, passwordHash });
  console.log(`[seed] Created ${email}. Change the password before using outside local development.`);
  process.exit(0);
}

seed().catch((error) => {
  console.error('[seed] Failed:', error);
  process.exit(1);
});
