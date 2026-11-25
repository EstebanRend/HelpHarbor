import { HttpStatus, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { ApiError } from "./api-error";

/** Validates a request body against a shared contract schema; 400 `validation_failed` lists every issue. */
export class ZodBodyPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "validation_failed",
      "Request body is invalid",
      result.error.issues.map((issue) => ({ path: issue.path.join(".") || "(body)", message: issue.message })),
    );
  }
}
