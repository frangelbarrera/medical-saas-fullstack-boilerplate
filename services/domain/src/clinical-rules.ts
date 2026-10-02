/**
 * Clinical rules: the encounter note state machine and AI draft policy
 * (ADR-004 / ADR-005).
 */
import { DomainError } from "./context.js";

export const ENCOUNTER_FLOW = {
  DRAFT: ["IN_REVIEW", "SIGNED"],
  IN_REVIEW: ["SIGNED", "DRAFT"],
  // SIGNED and AMENDED are terminal for user-driven transitions: corrections
  // go through amend(), which opens a linked DRAFT (CLIN-002).
  SIGNED: [],
  AMENDED: [],
} as const;

export type EncounterState = keyof typeof ENCOUNTER_FLOW;
export type EncounterTarget = (typeof ENCOUNTER_FLOW)[EncounterState][number];

export const assertTransition = (from: EncounterState, to: EncounterTarget): void => {
  if (!(ENCOUNTER_FLOW[from] as readonly string[]).includes(to)) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      `Cannot transition encounter from ${from} to ${to}`,
    );
  }
};

export const canEditContent = (status: EncounterState): boolean =>
  status === "DRAFT" || status === "IN_REVIEW";

/**
 * AI draft policy: model output can only produce DRAFT clinical content.
 * An AI draft can never directly activate a medication order or sign a note;
 * a clinician with clinical:sign must review and act.
 */
export const AI_DRAFT_RULES = {
  /** medication orders authored from an AI draft always start as DRAFT */
  medicationOrderRequiresReview: true,
  /** encounters seeded from an AI draft always start as DRAFT */
  encounterStartsAsDraft: true,
  /** drafts must display the review-required notice */
  reviewNotice: "AI draft - clinician review required before signing.",
} as const;
