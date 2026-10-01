/**
 * Zod validation middleware: parses and replaces req.body / req.query with
 * the validated value; failures surface as RFC 9457 problem details.
 */
import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { ApiError } from "./errors.js";

export const validateBody = <T extends z.ZodType>(schema: T) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new ApiError(400, "VALIDATION_FAILED", "Request validation failed", undefined, parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        }))),
      );
    }
    req.body = parsed.data;
    next();
  };

export const validateQuery = <T extends z.ZodType>(schema: T) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return next(
        new ApiError(400, "VALIDATION_FAILED", "Query validation failed", undefined, parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        }))),
      );
    }
    (req as Request & { validatedQuery?: unknown }).validatedQuery = parsed.data;
    next();
  };
