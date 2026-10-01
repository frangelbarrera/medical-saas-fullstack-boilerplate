/**
 * Global search for the command palette (UX-003: server-side, minimal
 * projection, rate-limited).
 */
import { Router } from "express";
import {

} from "@medical/contracts";
import { withTenantRepos } from "@medical/data";
import { asyncHandler } from "../middleware/errors.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import { searchLimiter } from "../middleware/security.js";
export const searchRouter = Router();

searchRouter.get(
  "/search",
  authenticate,
  searchLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
    if (q.length < 2) {
      res.json({ items: [] });
      return;
    }
    const hits = await withTenantRepos(ctx, (repos) =>
      repos.patients.search(ctx.tenantId, { q, page: 1, limit: 8 }),
    );
    res.json({
      items: hits.items.map((p) => ({
        kind: "patient" as const,
        id: p.id,
        title: p.fullName,
        subtitle: `${p.internalRef}${p.birthYear ? ` · ${p.birthYear}` : ""}`,
        href: `/patients/${p.id}/record`,
      })),
    });
  }),
);
