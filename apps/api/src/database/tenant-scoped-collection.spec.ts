import { type Collection, ObjectId } from "mongodb";
import { MissingTenantScopeError, TenantScopedCollection } from "./tenant-scoped-collection";

interface Note {
  _id: ObjectId;
  tenantId: ObjectId;
  body: string;
}

function fakeCollection() {
  const calls: string[] = [];
  const record = (name: string) => (..._args: unknown[]) => {
    calls.push(name);
    return name === "find" || name === "aggregate" ? { toArray: async () => [] } : Promise.resolve(null);
  };
  const collection = {
    collectionName: "notes",
    find: record("find"),
    findOne: record("findOne"),
    countDocuments: record("countDocuments"),
    insertOne: record("insertOne"),
    updateOne: record("updateOne"),
    deleteOne: record("deleteOne"),
    aggregate: record("aggregate"),
  } as unknown as Collection<Note>;
  return { scoped: new TenantScopedCollection<Note>(collection), calls };
}

describe("TenantScopedCollection", () => {
  const tenantId = new ObjectId();

  it("passes scoped operations through to the driver", async () => {
    const { scoped, calls } = fakeCollection();
    scoped.find({ tenantId });
    await scoped.findOne({ tenantId, body: "x" });
    await scoped.countDocuments({ tenantId });
    await scoped.insertOne({ _id: new ObjectId(), tenantId, body: "x" });
    await scoped.updateOne({ tenantId, _id: new ObjectId() }, { $set: { body: "y" } });
    await scoped.deleteOne({ tenantId });
    scoped.aggregate([{ $match: { tenantId } }, { $limit: 1 }]);
    expect(calls).toEqual(["find", "findOne", "countDocuments", "insertOne", "updateOne", "deleteOne", "aggregate"]);
  });

  it("rejects filters without tenantId before reaching the driver", () => {
    const { scoped, calls } = fakeCollection();
    expect(() => scoped.find({ body: "x" })).toThrow(MissingTenantScopeError);
    expect(() => scoped.findOne({})).toThrow(MissingTenantScopeError);
    expect(() => scoped.countDocuments({ _id: new ObjectId() })).toThrow(MissingTenantScopeError);
    expect(() => scoped.deleteOne({ body: "x" })).toThrow(MissingTenantScopeError);
    expect(() => scoped.updateOne({ body: "x" }, { $set: { body: "y" } })).toThrow(MissingTenantScopeError);
    expect(calls).toEqual([]);
  });

  it("rejects operator or string tenant filters that could match several tenants", () => {
    const { scoped } = fakeCollection();
    expect(() => scoped.find({ tenantId: { $ne: tenantId } })).toThrow(MissingTenantScopeError);
    expect(() => scoped.find({ tenantId: { $exists: true } })).toThrow(MissingTenantScopeError);
    expect(() => scoped.find({ tenantId: tenantId.toHexString() } as never)).toThrow(MissingTenantScopeError);
    expect(() => scoped.find({ $or: [{ tenantId }, { body: "x" }] })).toThrow(MissingTenantScopeError);
  });

  it("rejects inserts without a tenant", () => {
    const { scoped } = fakeCollection();
    expect(() => scoped.insertOne({ body: "x" } as never)).toThrow(MissingTenantScopeError);
  });

  it("does not let an update move a document to another tenant", () => {
    const { scoped } = fakeCollection();
    expect(() => scoped.updateOne({ tenantId }, { $set: { tenantId: new ObjectId() } })).toThrow(/may not change tenantId/);
    expect(() => scoped.updateOne({ tenantId }, { $unset: { tenantId: "" } })).toThrow(/may not change tenantId/);
  });

  it("requires aggregations to start with a tenant $match", () => {
    const { scoped } = fakeCollection();
    expect(() => scoped.aggregate([{ $limit: 1 }])).toThrow(MissingTenantScopeError);
    expect(() => scoped.aggregate([{ $match: { body: "x" } }])).toThrow(MissingTenantScopeError);
    expect(() => scoped.aggregate([])).toThrow(MissingTenantScopeError);
  });
});
