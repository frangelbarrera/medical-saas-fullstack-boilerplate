/**
 * Body validation middleware using Zod schemas.
 */
import { Request, Response, NextFunction } from "express";
import { ZodError, ZodTypeAny } from "zod";

export const validateBody = (schema: ZodTypeAny) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (e: any) {
      if (e instanceof ZodError) {
        return res.status(400).json({ error: "Validation Error", details: (e as any).errors || e.issues });
      }
      next(e);
    }
  };
};
