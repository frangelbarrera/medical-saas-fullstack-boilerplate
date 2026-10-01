/**
 * AI draft annotation (ADR-005 / design v2): the AI is a secondary editorial
 * note with explicit provenance and a review-required state - never a hero
 * panel, never a signable order.
 */
import { type ReactNode } from "react";
import { StateLabel } from "./primitives.js";

export const AiNote = ({
  children,
  onInsert,
  onDiscard,
  model,
  promptVersion,
}: {
  children: ReactNode;
  onInsert?: () => void;
  onDiscard?: () => void;
  model?: string;
  promptVersion?: string;
}) => (
  <aside
    aria-label="AI draft - clinician review required"
    className="border-l-[3px] border-[#a8b9ad] bg-[#eceee8] px-4 py-3.5 mt-6"
  >
    <div className="flex justify-between items-center gap-3 font-mono text-2xs text-[#617064]">
      <span>
        AI DRAFT / NOTE ASSIST{model ? ` · ${model}` : ""}{promptVersion ? ` · ${promptVersion}` : ""}
      </span>
      <StateLabel tone="review">Review required</StateLabel>
    </div>
    <div className="text-md font-serif leading-snug text-[#364338] my-3">{children}</div>
    <p className="text-2xs text-[#727b72] font-sans m-0">
      Draft generated from this session. Compare with the source before inserting; a clinician signs the note.
    </p>
    {onInsert || onDiscard ? (
      <div className="flex gap-2 mt-3">
        {onInsert ? (
          <button
            type="button"
            onClick={onInsert}
            className="text-xs bg-ink text-white px-3 py-1.5 hover:bg-navy focus-visible:outline focus-visible:outline-2"
          >
            Insert into draft ↗
          </button>
        ) : null}
        {onDiscard ? (
          <button
            type="button"
            onClick={onDiscard}
            className="text-xs text-ink-soft border border-rule px-3 py-1.5 hover:border-ink focus-visible:outline focus-visible:outline-2"
          >
            Discard
          </button>
        ) : null}
      </div>
    ) : null}
  </aside>
);
