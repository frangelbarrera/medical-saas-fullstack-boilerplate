/**
 * Error mapping to RFC 9457 Problem Details + async route wrapper.
 */
import type { NextFunction, Request, Response } from "express";
import { problem, type ProblemDetail } from "@medical/contracts";
import { DomainError } from "@medical/domain";
import { loadEnv } from "@medical/data";
import { logger } from "../lib/logger.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: Parameters<typeof problem>[0],
    title: string,
    public detail?: string,
    public errors?: { field: string; message: string }[],
    /** Safe scalar extensions surfaced on the problem detail (RFC 9457). */
    public meta?: Record<string, string | number | boolean | null>,
  ) {
    super(title);
    this.name = "ApiError";
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  BREAK_GLASS_REQUIRED: 403,
  CARE_RELATIONSHIP_REQUIRED: 403,
  STEP_UP_REQUIRED: 403,
  MFA_REQUIRED: 401,
  MFA_INVALID_CODE: 401,
  DSAR_APPROVAL_REQUIRED: 403,
  ARTIFACT_UNAVAILABLE: 409,
  CONSENT_REQUIRED: 422,
  UNPROCESSABLE: 422,
};

export const toProblem = (err: unknown): ProblemDetail => {
  if (err instanceof ApiError) {
    return problem(err.code, err.message, err.status, {
      detail: err.detail,
      errors: err.errors,
      meta: err.meta,
    });
  }
  if (err instanceof DomainError) {
    const status = STATUS_BY_CODE[err.code] ?? 400;
    return problem(err.code, err.message, status, { detail: err.message });
  }
  const zodErr = err as { name?: string; issues?: { path: (string | number)[]; message: string }[] };
  if (zodErr?.name === "ZodError" && Array.isArray(zodErr.issues)) {
    return problem("VALIDATION_FAILED", "Request validation failed", 400, {
      errors: zodErr.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  // Body-parser failures (malformed JSON, unsupported encoding, size limits)
  // carry a numeric status + machine type; never surface their raw message.
  const parserErr = err as { type?: string; status?: number };
  if (
    typeof parserErr?.status === "number" &&
    parserErr.status >= 400 &&
    parserErr.status < 500 &&
    typeof parserErr.type === "string"
  ) {
    if (parserErr.status === 413) {
      return problem("PAYLOAD_TOO_LARGE", "Request body exceeds the accepted size", 413);
    }
    return problem("VALIDATION_FAILED", "Request body could not be parsed", 400, {
      detail: "The request body is malformed or uses an unsupported encoding.",
    });
  }
  return problem("INTERNAL", "Internal server error", 500);
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const pd = toProblem(err);
  if (pd.status >= 500) {
    logger.error({ msg: "Unhandled error", err: String(err) });
  }
  if (loadEnv().NODE_ENV !== "production" && pd.status >= 500 && err instanceof Error && err.stack) {
    res.setHeader("x-development-stack", "present");
  }
  res.status(pd.status).json(pd);
};

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json(problem("NOT_FOUND", "Resource not found", 404));
};
