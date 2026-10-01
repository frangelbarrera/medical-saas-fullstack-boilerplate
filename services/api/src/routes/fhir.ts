/**
 * FHIR R4 read-only mapping endpoints (sandbox-grade interoperability).
 */
import { Router } from "express";
import {

} from "@medical/contracts";
import { withTenantRepos, loadEnv } from "@medical/data";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { authenticate, requireCapability, type AuthedRequest } from "../middleware/auth.js";
import {
  bundle as fhirBundle,
  toFhirPatient,
  capabilityStatement,
  mapIcd10ToSnomed,
} from "@medical/integrations";
export const fhirRouter = Router();

const BASE_URL = () => loadEnv().FRONTEND_URL;

fhirRouter.get(
  "/fhir/metadata",
  asyncHandler(async (_req, res) => {
    res.json(capabilityStatement(BASE_URL()));
  }),
);

fhirRouter.get(
  "/fhir/Patient/:id",
  authenticate,
  requireCapability("clinical:read"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const resource = await withTenantRepos(ctx, async (repos) => {
      const patient = await repos.patients.findById(ctx.tenantId, req.params.id);
      if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found");
      await repos.audit.append(ctx, {
        action: "FHIR_RESOURCE_EXPORTED",
        category: "EXPORT",
        subjectPatientId: patient.id,
        details: { resourceType: "Patient" },
      });
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
