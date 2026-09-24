// index.ts
import 'dotenv/config'; // Loads .env variables into process.env
import { PrismaClient } from "@/generated/prisma";

// Validate that DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in environment variables.');
  process.exit(1);
}

// Create Prisma Client instance
const prisma = new PrismaClient();

async function main() {
  // Example query: count users
  const userCount = await prisma.users.count();
  console.log(`✅ Total users: ${userCount}`);
}

main()
  .catch((err) => {
    console.error('❌ Error running Prisma query:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
