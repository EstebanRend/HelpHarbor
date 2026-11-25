import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { ErrorEnvelope } from "@helpharbor/contracts";
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
      // Body-parser errors (malformed JSON, too large) arrive here as HttpExceptions too.
      body = { code, message: status >= 500 ? "Something went wrong" : exception.message, requestId };
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.path} failed [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (body.details === undefined) delete body.details;
    response.status(status).json({ error: body });
  }
}
