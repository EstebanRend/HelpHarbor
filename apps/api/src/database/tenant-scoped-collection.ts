import {
  ObjectId,
  type AggregateOptions,
  type Collection,
  type CountDocumentsOptions,
  type DeleteResult,
  type Document,
  type Filter,
  type FindOneAndUpdateOptions,
  type FindOptions,
  type InsertOneOptions,
  type InsertOneResult,
  type OptionalUnlessRequiredId,
  type UpdateFilter,
  type UpdateOptions,
  type UpdateResult,
  type WithId,
} from "mongodb";

/** Thrown when code tries to read or write tenant-owned data without a tenant scope. */
export class MissingTenantScopeError extends Error {
  constructor(collection: string, operation: string) {
    super(`${operation} on "${collection}" must filter on a concrete tenantId (ObjectId)`);
    this.name = "MissingTenantScopeError";
  }
}

export interface TenantOwned {
  tenantId: ObjectId;
}

/**
 * Wraps a collection of tenant-owned documents. Every filter must contain
 * `tenantId` set to a concrete ObjectId — not an operator such as `$ne` or
 * `$exists`, and not inside `$or` — so a query can never span tenants by
 * accident. Updates may not change `tenantId`.
 */
export class TenantScopedCollection<T extends TenantOwned & Document> {
  constructor(private readonly collection: Collection<T>) {}

  get collectionName(): string {
    return this.collection.collectionName;
  }

  find(filter: Filter<T>, options?: FindOptions) {
    this.assertScoped(filter, "find");
    return this.collection.find(filter, options);
  }

  findOne(filter: Filter<T>, options?: FindOptions): Promise<WithId<T> | null> {
    this.assertScoped(filter, "findOne");
    return this.collection.findOne(filter, options);
  }

  countDocuments(filter: Filter<T>, options?: CountDocumentsOptions): Promise<number> {
    this.assertScoped(filter, "countDocuments");
    return this.collection.countDocuments(filter, options);
  }

  insertOne(doc: OptionalUnlessRequiredId<T>, options?: InsertOneOptions): Promise<InsertOneResult<T>> {
    if (!(doc.tenantId instanceof ObjectId)) {
      throw new MissingTenantScopeError(this.collectionName, "insertOne");
    }
    return options ? this.collection.insertOne(doc, options) : this.collection.insertOne(doc);
  }

  /**
   * Returns the updated (or, with `upsert`, inserted) document. An upsert copies
   * the filter's `tenantId` into the new document, so it stays in the tenant.
   */
  findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options: FindOneAndUpdateOptions & { returnDocument: "before" | "after" },
  ): Promise<WithId<T> | null> {
    this.assertScoped(filter, "findOneAndUpdate");
    this.assertTenantUnchanged(update);
    return this.collection.findOneAndUpdate(filter, update, { ...options, includeResultMetadata: false });
  }

  updateOne(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<UpdateResult<T>> {
    this.assertScoped(filter, "updateOne");
    this.assertTenantUnchanged(update);
    return this.collection.updateOne(filter, update, options);
  }

  deleteOne(filter: Filter<T>): Promise<DeleteResult> {
    this.assertScoped(filter, "deleteOne");
    return this.collection.deleteOne(filter);
  }

  /** The first stage must be a `$match` on a concrete `tenantId`. */
  aggregate<R extends Document = Document>(pipeline: Document[], options?: AggregateOptions) {
    const first = pipeline[0];
    if (!first || typeof first !== "object" || !("$match" in first)) {
      throw new MissingTenantScopeError(this.collectionName, "aggregate");
    }
    this.assertScoped(first.$match as Filter<T>, "aggregate");
    return this.collection.aggregate<R>(pipeline, options);
  }

  private assertScoped(filter: Filter<T> | undefined, operation: string): void {
    const tenantId = (filter as Record<string, unknown> | undefined)?.tenantId;
    if (!(tenantId instanceof ObjectId)) {
      throw new MissingTenantScopeError(this.collectionName, operation);
    }
  }

  private assertTenantUnchanged(update: UpdateFilter<T>): void {
    for (const [operator, fields] of Object.entries(update)) {
      if (operator.startsWith("$") && fields && typeof fields === "object" && "tenantId" in fields) {
        throw new Error(`updates on "${this.collectionName}" may not change tenantId`);
      }
    }
  }
}
