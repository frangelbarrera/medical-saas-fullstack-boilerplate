/**
 * FHIR R4 read-only mapping endpoints (sandbox-grade interoperability).
 */
import { Router } from "express";
import {

} from "@medical/contracts";
import { withTenantRepos, loadEnv } from "@medical/data";
import { assertPatientScope } from "@medical/domain";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { authenticate, requireCapability, type AuthedRequest } from "../middleware/auth.js";
import {
  bundle as fhirBundle,
  toFhirPatient,
  capabilityStatement,
  mapIcd10ToSnomed,
  toFhirAuditEvent,
  toFhirProvenance,
  smartConfiguration,
} from "@medical/integrations";
export const fhirRouter = Router();

const BASE_URL = () => loadEnv().FRONTEND_URL;

fhirRouter.get(
  "/fhir/metadata",
  asyncHandler(async (_req, res) => {
    res.json(capabilityStatement(BASE_URL()));
  }),
);

/**
 * SMART App Launch discovery (INT-001). Authorization endpoints appear only
 * when an external SMART_AUTH_SERVER_URL is configured; this resource server
 * never issues tokens itself.
 */
fhirRouter.get(
  "/.well-known/smart-configuration",
  asyncHandler(async (_req, res) => {
    res.json(smartConfiguration(BASE_URL(), loadEnv().SMART_AUTH_SERVER_URL));
  }),
);

fhirRouter.get(
  "/fhir/Patient/:id",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const purposeOfUse = typeof req.query.purposeOfUse === "string" ? req.query.purposeOfUse : "TREATMENT";
    const resource = await withTenantRepos(ctx, async (repos) => {
      const patient = await repos.patients.findById(ctx.tenantId, req.params.id);
      if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      // FHIR reads are clinical reads: the same governed access model applies
      // (break-glass for administrators, care relationship for clinicians),
      // and the purpose of use lands in the audit chain.
      if (ctx.selfPatientId) {
        assertPatientScope(ctx, req.params.id);
      } else if (ctx.actorRole === "ADMIN") {
        const granted = await repos.clinical.hasActiveBreakGlass(ctx.tenantId, ctx.actorId, req.params.id);
        if (!granted) {
          throw new ApiError(
            403,
            "BREAK_GLASS_REQUIRED",
            "This clinical resource requires a justified break-glass access",
            "Provide a reason to open the record under emergency access. The access is logged and expires after 30 minutes.",
          );
        }
      } else if (ctx.actorRole === "DOCTOR") {
        const related = await repos.clinical.hasCareRelationship(ctx.tenantId, ctx.actorId, req.params.id);
        if (!related) {
          throw new ApiError(
            403,
            "CARE_RELATIONSHIP_REQUIRED",
            "You are not part of this patient's care team",
            "Ask the treating clinician or an administrator to add you to the care team. The assignment is audited.",
          );
        }
      }
      await repos.audit.append(ctx, {
        action: "FHIR_RESOURCE_EXPORTED",
        category: "EXPORT",
        subjectPatientId: patient.id,
        purpose: purposeOfUse,
        details: { resourceType: "Patient" },
      });
      // Consent-driven security label: DATA_SHARING GRANTED -> N, else R.
      const sharing = await repos.patients.consentFor(ctx.tenantId, patient.id, "DATA_SHARING");
      return toFhirPatient(
        {
          id: patient.id,
          internalRef: patient.internalRef,
          fullName: patient.fullName,
          sex: patient.sex,
          birthDate: patient.birthDate,
          phone: patient.phone,
          email: patient.email,
          address: patient.address,
          sharingGranted: sharing === "GRANTED",
        },
        BASE_URL(),
      );
    });
    res.json(resource);
  }),
);

fhirRouter.get(
  "/fhir/Patient",
  authenticate,
  requireCapability("patients:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const resources = await withTenantRepos(ctx, async (repos) => {
      // Minimum-necessary directory projection (no contact PHI).
      const page = await repos.patients.search(ctx.tenantId, {
        q: typeof req.query.name === "string" ? req.query.name : "",
        page: 1,
        limit: 50,
      });
      await repos.audit.append(ctx, {
        action: "FHIR_RESOURCE_EXPORTED",
        category: "EXPORT",
        details: { resourceType: "Patient", count: page.items.length },
      });
      return fhirBundle(
        "searchset",
        page.items.map((p) =>
          toFhirPatient(
            {
              id: p.id,
              internalRef: p.internalRef,
              fullName: p.fullName,
              sex: p.sex,
              birthDate: null,
              phone: null,
              email: null,
              address: null,
            },
            BASE_URL(),
          ),
        ),
        BASE_URL(),
      );
    });
    res.json(resources);
  }),
);

fhirRouter.get(
  "/fhir/terminology/map",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const code = typeof req.query.icd10 === "string" ? req.query.icd10 : null;
    const entry = code ? mapIcd10ToSnomed(code) : null;
    res.json({ mapped: entry });
  }),
);

/**
 * AuditEvent search (INT-001): the FHIR projection of the hash-chained audit
 * trail for one patient. Governed like every other PHI surface.
 */
fhirRouter.get(
  "/fhir/AuditEvent",
  authenticate,
  requireCapability("audit:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const patientId = typeof req.query.patient === "string" ? req.query.patient.replace(/^Patient\//, "") : "";
    if (!patientId) throw new ApiError(400, "VALIDATION_FAILED", "The patient query parameter is required");
    assertPatientScope(ctx, patientId);
    const bundle = await withTenantRepos(ctx, async (repos) => {
      if (ctx.actorRole === "ADMIN") {
        const granted = await repos.clinical.hasActiveBreakGlass(ctx.tenantId, ctx.actorId, patientId);
        if (!granted) throw new ApiError(403, "BREAK_GLASS_REQUIRED", "This clinical resource requires a justified break-glass access");
      } else if (ctx.actorRole === "DOCTOR") {
        const related = await repos.clinical.hasCareRelationship(ctx.tenantId, ctx.actorId, patientId);
        if (!related) throw new ApiError(403, "CARE_RELATIONSHIP_REQUIRED", "You are not part of this patient's care team");
      }
      const events = await repos.audit.exportForPatient(ctx.tenantId, patientId);
      return fhirBundle(
        "searchset",
        events.map((e) =>
          toFhirAuditEvent({
            id: e.id,
            action: e.action,
            createdAt: e.createdAt,
            actorId: e.actorId,
            subjectPatientId: e.subjectPatientId,
            category: e.category,
            purpose: e.purpose,
          }),
        ),
        BASE_URL(),
      );
    });
    res.json(bundle);
  }),
);

/** Provenance search: derived from the same audited access history. */
fhirRouter.get(
  "/fhir/Provenance",
  authenticate,
  requireCapability("audit:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const patientId = typeof req.query.patient === "string" ? req.query.patient.replace(/^Patient\//, "") : "";
    if (!patientId) throw new ApiError(400, "VALIDATION_FAILED", "The patient query parameter is required");
    assertPatientScope(ctx, patientId);
    const bundle = await withTenantRepos(ctx, async (repos) => {
      if (ctx.actorRole === "ADMIN") {
        const granted = await repos.clinical.hasActiveBreakGlass(ctx.tenantId, ctx.actorId, patientId);
        if (!granted) throw new ApiError(403, "BREAK_GLASS_REQUIRED", "This clinical resource requires a justified break-glass access");
      } else if (ctx.actorRole === "DOCTOR") {
        const related = await repos.clinical.hasCareRelationship(ctx.tenantId, ctx.actorId, patientId);
        if (!related) throw new ApiError(403, "CARE_RELATIONSHIP_REQUIRED", "You are not part of this patient's care team");
      }
      const events = await repos.audit.exportForPatient(ctx.tenantId, patientId);
      return fhirBundle(
        "searchset",
        events.slice(0, 100).map((e) =>
          toFhirProvenance({
            id: e.id,
            action: e.action,
            createdAt: e.createdAt,
            actorId: e.actorId,
            subjectPatientId: e.subjectPatientId,
          }),
        ),
        BASE_URL(),
      );
    });
    res.json(bundle);
  }),
);
