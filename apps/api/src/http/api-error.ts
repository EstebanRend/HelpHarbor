import { HttpException, HttpStatus } from "@nestjs/common";

export interface ErrorDetail {
  path: string;
  message: string;
}

/** An HTTP error that renders as the shared error envelope with a stable snake_case code. */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super({ code, message, details }, status);
  }

  static unauthenticated(): ApiError {
    return new ApiError(HttpStatus.UNAUTHORIZED, "unauthenticated", "Sign in to continue");
  }

  static sessionExpired(): ApiError {
    return new ApiError(HttpStatus.UNAUTHORIZED, "session_expired", "Your session has ended; sign in again");
  }

  static forbidden(message = "You do not have permission to do this"): ApiError {
    return new ApiError(HttpStatus.FORBIDDEN, "forbidden", message);
  }

  /** Used for resources in other tenants too, so their existence is not revealed. */
  static notFound(what: string): ApiError {
    return new ApiError(HttpStatus.NOT_FOUND, "not_found", `${what} not found`);
  }
}
