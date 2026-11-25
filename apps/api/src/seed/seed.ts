import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import { PasswordService } from "../auth/password.service";
import { ensureCollections } from "../database/schema";
import { DEMO_USERS, seedDemoIdentities } from "./demo-identities";

// Usage: pnpm seed   (reads MONGODB_URI and SEED_DEMO_PASSWORD from the root .env)
async function main(): Promise<void> {
  try {
    process.loadEnvFile(resolve(__dirname, "../../../../.env"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    const db = client.db();
    await ensureCollections(db);
    const summary = await seedDemoIdentities(db, process.env.SEED_DEMO_PASSWORD ?? "", new PasswordService());
    console.log(`seeded ${summary.tenants} tenants, ${summary.users} users, ${summary.memberships} memberships`);
    console.log("demo accounts (password = SEED_DEMO_PASSWORD):");
    for (const user of DEMO_USERS) {
      const roles = user.memberships.map((m) => `${m.role}@${m.tenant}`).join(", ");
      console.log(`  ${user.email.padEnd(36)} ${roles}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(`seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
