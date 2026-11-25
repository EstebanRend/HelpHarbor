import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { type ErrorEnvelope, redactEmails } from "@helpharbor/contracts";
import type { Request, Response } from "express";
import { ApiError } from "./api-error";

const CODES_BY_STATUS: Record<number, string> = {
  400: "bad_request",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  413: "payload_too_large",
  415: "unsupported_media_type",
  429: "too_many_requests",
};

/** `http-errors` marks errors that are safe to show the client with `expose: true`. */
function isClientHttpError(error: unknown): error is Error & { status: number } {
  if (!(error instanceof Error)) return false;
  const { status, expose } = error as Error & { status?: unknown; expose?: unknown };
  return typeof status === "number" && status >= 400 && status < 500 && expose === true;
}

/** Renders every error as `{ error: { code, message, requestId, details? } }`. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorEnvelope["error"] = { code: "internal_error", message: "Something went wrong", requestId };

    if (exception instanceof ApiError) {
      status = exception.getStatus();
      body = { code: exception.code, message: exception.message, requestId, details: exception.details };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code = CODES_BY_STATUS[status] ?? (status >= 500 ? "internal_error" : "request_failed");
      body = { code, message: status >= 500 ? "Something went wrong" : exception.message, requestId };
    } else if (isClientHttpError(exception)) {
      // Body-parser errors (malformed JSON, body too large, bad charset) are plain
      // `http-errors` objects, not HttpExceptions; they are the client's fault.
      status = exception.status;
      body = { code: CODES_BY_STATUS[status] ?? "request_failed", message: exception.message, requestId };
    }

    if (status >= 500) {
      // Driver errors can quote the offending document (e.g. a duplicate email); never log addresses in full.
      this.logger.error(
        `${request.method} ${request.path} failed [${requestId}]`,
        redactEmails(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)),
      );
    }

    if (body.details === undefined) delete body.details;
    response.status(status).json({ error: body });
  }
}
