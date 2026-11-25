import { HttpStatus, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { ApiError } from "./api-error";

/**
 * Validates query parameters against a shared contract schema. Repeated
 * parameters (`?view=a&view=b`) arrive as arrays and fail validation, so a
 * query value is always a single string before it reaches a repository.
 */
export class ZodQueryPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "validation_failed",
      "Query parameters are invalid",
      result.error.issues.map((issue) => ({ path: issue.path.join(".") || "(query)", message: issue.message })),
    );
  }
}
