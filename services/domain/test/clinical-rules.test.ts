import { describe, expect, it } from "vitest";
import { ENCOUNTER_FLOW, assertTransition, canEditContent, AI_DRAFT_RULES } from "@medical/domain";

describe("encounter state machine", () => {
  it("allows draft -> review -> sign", () => {
    expect(() => assertTransition("DRAFT", "IN_REVIEW")).not.toThrow();
    expect(() => assertTransition("IN_REVIEW", "SIGNED")).not.toThrow();
  });

  it("allows signing a draft directly", () => {
    expect(ENCOUNTER_FLOW.DRAFT).toContain("SIGNED");
  });

  it("blocks editing signed notes", () => {
    expect(canEditContent("DRAFT")).toBe(true);
    expect(canEditContent("IN_REVIEW")).toBe(true);
    expect(canEditContent("SIGNED")).toBe(false);
    expect(canEditContent("AMENDED")).toBe(false);
    expect(() => assertTransition("SIGNED", "DRAFT")).toThrowError(/transition/i);
  });

  it("treats signed and amended notes as terminal for direct transitions", () => {
    // Corrections go through amend(): the original never receives a direct
    // user-driven transition; AMENDED is applied by the amendment-signing
    // transaction only.
    expect(ENCOUNTER_FLOW.SIGNED).toEqual([]);
    expect(ENCOUNTER_FLOW.AMENDED).toEqual([]);
    expect(canEditContent("AMENDED")).toBe(false);
  });

  it("keeps AI drafts review-gated (ADR-005)", () => {
    expect(AI_DRAFT_RULES.medicationOrderRequiresReview).toBe(true);
    expect(AI_DRAFT_RULES.encounterStartsAsDraft).toBe(true);
    expect(AI_DRAFT_RULES.reviewNotice).toMatch(/clinician review/i);
  });
});
