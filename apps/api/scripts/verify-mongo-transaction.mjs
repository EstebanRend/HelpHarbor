// Checks that the local MongoDB is a replica set and that multi-document
// transactions commit and roll back. Uses a throwaway database and drops it.
// Usage: pnpm --filter @helpharbor/api verify:mongo
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/?directConnection=true";
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
const dbName = `helpharbor_txcheck_${Date.now()}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await client.connect();
  const hello = await client.db("admin").command({ hello: 1 });
  assert(hello.setName, "MongoDB is not running as a replica set; transactions are unavailable");
  console.log(`connected to replica set "${hello.setName}"`);

  const db = client.db(dbName);
  const tickets = await db.createCollection("tickets");
  const events = await db.createCollection("ticket_events");
  const session = client.startSession();

  try {
    await session.withTransaction(async () => {
      const { insertedId } = await tickets.insertOne(
        { tenantId: "txcheck", number: 1, status: "new" },
        { session },
      );
      await events.insertOne({ tenantId: "txcheck", ticketId: insertedId, type: "created" }, { session });
    });

    await session
      .withTransaction(async () => {
        await tickets.insertOne({ tenantId: "txcheck", number: 2, status: "new" }, { session });
        throw new Error("rollback on purpose");
      })
      .catch((error) => {
        if (error.message !== "rollback on purpose") throw error;
      });
  } finally {
    await session.endSession();
  }

  const ticketCount = await tickets.countDocuments();
  const eventCount = await events.countDocuments();
  assert(ticketCount === 1, `expected 1 committed ticket, found ${ticketCount}`);
  assert(eventCount === 1, `expected 1 committed event, found ${eventCount}`);
  console.log("transaction committed and rolled back as expected");
  await db.dropDatabase();
} catch (error) {
  console.error(`verify:mongo failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
