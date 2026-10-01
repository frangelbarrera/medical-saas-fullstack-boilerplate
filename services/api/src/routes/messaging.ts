/**
 * Messaging routes: secure inbox (threads + messages) and notifications.
 */
import { Router } from "express";
import { threadCreate, messageCreate } from "@medical/contracts";
import { withTenantRepos } from "@medical/data";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import { authenticate, requireCapability, type AuthedRequest } from "../middleware/auth.js";

export const messagingRouter = Router();

messagingRouter.get(
  "/threads",
  authenticate,
  requireCapability("messages:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const threads = await withTenantRepos(ctx, (repos) => repos.messaging.listThreads(ctx.tenantId, ctx.actorId));
    res.json({ items: threads });
  }),
);

messagingRouter.post(
  "/threads",
  authenticate,
  requireCapability("messages:write"),
  validateBody(threadCreate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const created = await withTenantRepos(ctx, async (repos) => {
      const thread = await repos.messaging.createThread(ctx, req.body);
      await repos.audit.append(ctx, {
        action: "MESSAGE_SENT",
        category: "PHI",
        subjectPatientId: thread.patientId ?? undefined,
        target: thread.id,
        details: { subject: thread.subject },
      });
      return thread;
    });
    res.status(201).json(created);
  }),
);

messagingRouter.get(
  "/threads/:id/messages",
  authenticate,
  requireCapability("messages:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const messages = await withTenantRepos(ctx, async (repos) => {
      const items = await repos.messaging.listMessages(ctx.tenantId, req.params.id, ctx.actorId);
      if (items === null) throw new ApiError(404, "NOT_FOUND", "Thread not found");
      await repos.messaging.markRead(ctx, req.params.id);
      return items;
    });
    res.json({ items: messages });
  }),
);

messagingRouter.post(
  "/threads/:id/messages",
  authenticate,
  requireCapability("messages:write"),
  validateBody(messageCreate),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const sent = await withTenantRepos(ctx, async (repos) => {
      const message = await repos.messaging.addMessage(ctx, req.params.id, req.body.body);
      if (!message) throw new ApiError(404, "NOT_FOUND", "Thread not found");
      await repos.audit.append(ctx, {
        action: "MESSAGE_SENT",
        category: "PHI",
        target: req.params.id,
      });
      return message;
    });
    res.status(201).json(sent);
  }),
);

messagingRouter.get(
  "/notifications",
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const unreadOnly = req.query.unread === "1";
    const notifications = await withTenantRepos(ctx, (repos) =>
      repos.messaging.listNotifications(ctx.tenantId, ctx.actorId, unreadOnly),
    );
    res.json({ items: notifications });
  }),
);

messagingRouter.post(
  "/notifications/:id/read",
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    await withTenantRepos(ctx, (repos) =>
      repos.messaging.markNotificationRead(ctx.tenantId, ctx.actorId, req.params.id),
    );
    res.json({ ok: true });
  }),
);
