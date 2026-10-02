/**
 * Compliance packs (GOV-001): per-jurisdiction configuration a tenant clinic
 * selects through `clinics.jurisdiction`. A pack is configuration + guidance,
 * never a legal certification: production deployments must pair it with
 * counsel-reviewed documents (DPA, DPIA, RoPA) for the jurisdiction.
 */
export const JURISDICTIONS = ["CH", "EU", "UK", "US", "CA", "AU"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export interface CompliancePack {
  jurisdiction: Jurisdiction;
  label: string;
  /** Primary legal frameworks the pack is modelled on. */
  frameworks: string[];
  /** Supervisory authority / regulator reference for privacy matters. */
  regulator: string;
  /** Default DSAR response deadline in days. */
  dsarDeadlineDays: number;
  /** Whether an explicit legal basis record is required before AI processing. */
  aiProcessingConsentRequired: boolean;
  /** Whether breach notification to the authority is mandatory and its window. */
  breachNotification: { required: boolean; deadlineHours: number } | null;
  /** Default record retention for clinical notes, in years. */
  clinicalRetentionYears: number;
  /** Data residency expectation recorded for subprocessor decisions. */
  dataResidency: string;
  notes: string[];
}

export const COMPLIANCE_PACKS: Record<Jurisdiction, CompliancePack> = {
  CH: {
    jurisdiction: "CH",
    label: "Switzerland (revFADP)",
    frameworks: ["revFADP", "nFADP ordinances", "EPR Act where applicable"],
    regulator: "FDPIC",
    dsarDeadlineDays: 30,
    aiProcessingConsentRequired: true,
    breachNotification: { required: false, deadlineHours: 0 },
    clinicalRetentionYears: 20,
    dataResidency: "Switzerland or adequate jurisdiction with documented transfer",
    notes: [
      "Health data qualifies as particularly sensitive personality data; heightened consent standards apply.",
      "The duty to inform, records of processing and sub-processor contracts are expected for clinic tenants.",
    ],
  },
  EU: {
    jurisdiction: "EU",
    label: "European Union (GDPR)",
    frameworks: ["GDPR", "Art. 9 special-category safeguards", "SCCs where transfers apply"],
    regulator: "National DPAs / EDPB guidance",
    dsarDeadlineDays: 30,
    aiProcessingConsentRequired: true,
    breachNotification: { required: true, deadlineHours: 72 },
    clinicalRetentionYears: 20,
    dataResidency: "EU/EEA unless adequate safeguards are documented",
    notes: [
      "Explicit consent or another Art. 9 condition is required before AI processing of health data.",
      "RoPA, DPIA and DPO designation are expected for typical clinic deployments.",
    ],
  },
  UK: {
    jurisdiction: "UK",
    label: "United Kingdom (UK GDPR + DPA 2018)",
    frameworks: ["UK GDPR", "Data Protection Act 2018", "UK IDTA / Addendum for transfers"],
    regulator: "ICO",
    dsarDeadlineDays: 30,
    aiProcessingConsentRequired: true,
    breachNotification: { required: true, deadlineHours: 72 },
    clinicalRetentionYears: 20,
    dataResidency: "UK or adequacy-covered processing",
    notes: [
      "Special category data conditions apply on top of the UK GDPR lawful basis.",
      "UK documentation is kept separate from EU documentation by design.",
    ],
  },
  US: {
    jurisdiction: "US",
    label: "United States (HIPAA)",
    frameworks: ["HIPAA Privacy Rule", "HIPAA Security Rule", "Breach Notification Rule", "state laws"],
    regulator: "HHS Office for Civil Rights",
    dsarDeadlineDays: 30,
    aiProcessingConsentRequired: false,
    breachNotification: { required: true, deadlineHours: 0 },
    clinicalRetentionYears: 10,
    dataResidency: "United States for covered-entity workloads",
    notes: [
      "A signed BAA is required before the product acts as a business associate.",
      "Minimum-necessary access, audit controls and the documented breach workflow apply; HIPAA certification does not exist.",
    ],
  },
  CA: {
    jurisdiction: "CA",
    label: "Canada (PIPEDA + provincial health privacy)",
    frameworks: ["PIPEDA", "provincial health information laws", "consent-based model"],
    regulator: "OPC / provincial commissioners",
    dsarDeadlineDays: 30,
    aiProcessingConsentRequired: true,
    breachNotification: { required: true, deadlineHours: 0 },
    clinicalRetentionYears: 15,
    dataResidency: "Canada preferred for public-sector health workloads",
    notes: [
      "Meaningful consent and purpose limitation drive the consent registry design.",
      "Provincial health privacy statutes take precedence where enacted; configure per province.",
    ],
  },
  AU: {
    jurisdiction: "AU",
    label: "Australia (Privacy Act / APPs)",
    frameworks: ["Privacy Act 1988", "Australian Privacy Principles", "My Health Records Act where applicable"],
    regulator: "OAIC",
    dsarDeadlineDays: 30,
    aiProcessingConsentRequired: true,
    breachNotification: { required: true, deadlineHours: 72 },
    clinicalRetentionYears: 15,
    dataResidency: "Australia unless an permitted overseas disclosure exists",
    notes: [
      "APP 12/13 access and correction duties include written responses and representative access rules.",
      "The Notifiable Data Breaches scheme applies to eligible data breaches.",
    ],
  },
};

export const compliancePackFor = (jurisdiction: string | null | undefined): CompliancePack =>
  COMPLIANCE_PACKS[(jurisdiction ?? "CH") as Jurisdiction] ?? COMPLIANCE_PACKS.CH;
