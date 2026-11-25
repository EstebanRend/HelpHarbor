import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { PERMISSIONS, type Permission } from "@helpharbor/contracts";
import { type Db, ObjectId } from "mongodb";
import type { TenantAuthContext } from "../../src/auth/auth-context";
import { CurrentTenant, RequirePermission } from "../../src/auth/decorators";
import { MONGO_DB } from "../../src/database/database.module";
import { TenantScopedCollection } from "../../src/database/tenant-scoped-collection";
import { ApiError } from "../../src/http/api-error";

/**
 * Test-only routes. Real ticket, SLA, KB and report endpoints arrive in later
 * weeks; these probes let the role matrix be tested through the real global
 * guards today, one GET and one POST route per permission.
 */
export const probePath = (permission: Permission) => `/api/v1/probe/${permission.replace(":", "/")}`;

class PermissionProbeController {}
for (const permission of PERMISSIONS) {
  const path = permission.replace(":", "/");
  for (const [verb, route] of [
    ["get", Get(path)],
    ["post", Post(path)],
  ] as const) {
    const key = `${verb} ${permission}`;
    const descriptor: PropertyDescriptor = {
      value: () => ({ permission }),
      writable: true,
      configurable: true,
    };
    Object.defineProperty(PermissionProbeController.prototype, key, descriptor);
    const decorated = Reflect.decorate([route, RequirePermission(permission)], PermissionProbeController.prototype, key, descriptor);
    Object.defineProperty(PermissionProbeController.prototype, key, decorated as PropertyDescriptor);
  }
}
Controller({ path: "probe", version: "1" })(PermissionProbeController);
export { PermissionProbeController };

interface NoteDoc {
  tenantId: ObjectId;
  body: string;
}

interface NoteResponse {
  id: string;
  tenantId: string;
  body: string;
}

function parseId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw ApiError.notFound("Note");
  return new ObjectId(id);
}

/**
 * A tenant-owned resource behind `TenantScopedCollection`, written the way
 * the ticket endpoints will be: the tenant comes from `CurrentTenant` only.
 */
@Controller({ path: "probe/notes", version: "1" })
export class NotesProbeController {
  private readonly notes: TenantScopedCollection<NoteDoc>;

  constructor(@Inject(MONGO_DB) db: Db) {
    this.notes = new TenantScopedCollection(db.collection<NoteDoc>("probe_notes"));
  }

  @RequirePermission("tickets:read")
  @Get()
  async list(@CurrentTenant() auth: TenantAuthContext): Promise<NoteResponse[]> {
    const docs = await this.notes.find({ tenantId: auth.tenant.id }).sort({ _id: 1 }).toArray();
    return docs.map((doc) => ({ id: doc._id.toHexString(), tenantId: doc.tenantId.toHexString(), body: doc.body }));
  }

  @RequirePermission("tickets:read")
  @Get(":id")
  async get(@CurrentTenant() auth: TenantAuthContext, @Param("id") id: string): Promise<NoteResponse> {
    const doc = await this.notes.findOne({ tenantId: auth.tenant.id, _id: parseId(id) });
    if (!doc) throw ApiError.notFound("Note");
    return { id: doc._id.toHexString(), tenantId: doc.tenantId.toHexString(), body: doc.body };
  }

  @RequirePermission("tickets:reply")
  @Post()
  async create(@CurrentTenant() auth: TenantAuthContext, @Body() body: { body?: unknown }): Promise<{ id: string }> {
    const result = await this.notes.insertOne({ tenantId: auth.tenant.id, body: String(body.body ?? "") });
    return { id: result.insertedId.toHexString() };
  }

  @RequirePermission("tickets:reply")
  @Patch(":id")
  async update(
    @CurrentTenant() auth: TenantAuthContext,
    @Param("id") id: string,
    @Body() body: { body?: unknown },
  ): Promise<{ id: string }> {
    const result = await this.notes.updateOne({ tenantId: auth.tenant.id, _id: parseId(id) }, { $set: { body: String(body.body ?? "") } });
    if (result.matchedCount === 0) throw ApiError.notFound("Note");
    return { id };
  }

  @RequirePermission("tickets:assign_others")
  @Delete(":id")
  async remove(@CurrentTenant() auth: TenantAuthContext, @Param("id") id: string): Promise<void> {
    const result = await this.notes.deleteOne({ tenantId: auth.tenant.id, _id: parseId(id) });
    if (result.deletedCount === 0) throw ApiError.notFound("Note");
  }
}
