/**
 * Audit: event trail with filters, chain verification and export.
 */
import { useCallback, useEffect, useState } from "react";
import type { AuditEvent, AuditVerification, Paginated } from "@medical/contracts";
import { api } from "../lib/api.js";
import { useI18n } from "../i18n/index.js";
import { formatDateTime } from "../lib/format.js";
import { Banner, Button, DataTable, Pagination, StateLabel, TableFoot, useToast } from "@medical/ui";

const CATEGORIES = ["", "AUTH", "PHI", "CLINICAL", "BILLING", "AI", "ADMIN", "EXPORT", "SYSTEM"] as const;

export const AuditView = () => {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState<Paginated<AuditEvent> | null>(null);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [verification, setVerification] = useState<AuditVerification | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api.auditEvents({ category: category || undefined, page, limit: 30 }).catch(() => null);
    if (r) setData(r);
  }, [category, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = async () => {
    setBusy(true);
    try {
      const v = await api.auditVerify();
      setVerification(v);
      toast(v.valid ? t("audit.valid") : t("audit.invalid"), v.valid ? "success" : "danger");
    } finally {
      setBusy(false);
    }
  };

  const exportUrl = api.auditExportUrl();

  return (
    <section aria-label={t("audit.title")}>
      <div className="flex items-end justify-between mb-8 max-md:flex-col max-md:items-start max-md:gap-5">
        <div>
          <h1 className="font-serif text-3xl m-0 text-ink mt-2">
            {t("audit.title")}<span className="text-moss">.</span>
          </h1>
          <p className="text-sm text-ink-soft mt-3 mb-0">{t("audit.lede")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void verify()}>{t("audit.verify")}</Button>
          <a href={exportUrl} className="inline-flex items-center gap-3 text-xs px-4 py-2.5 bg-ink text-white hover:bg-navy">
            {t("audit.export")} ↗
          </a>
        </div>
      </div>

      {verification ? (
        <div className="mb-6">
          <Banner tone={verification.valid ? "success" : "danger"}>
            {verification.valid ? t("audit.valid") : t("audit.invalid")} —{" "}
            {verification.valid ? t("audit.validDetail") : t("audit.invalidDetail")}{" "}
            ({verification.verifiedCount} + {verification.legacyCount} legacy)
          </Banner>
        </div>
      ) : null}

      <div className="flex gap-2 border-t-2 border-ink border-b border-rule py-3 mb-6">
        <div className="w-56">
          <label htmlFor="audit-cat" className="sr-only">{t("audit.category")}</label>
          <select id="audit-cat" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className="w-full bg-transparent border-0 border-b border-rule py-1 text-sm text-ink-soft focus:outline-none">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c === "" ? t("audit.category") : c}</option>
            ))}
          </select>
        </div>
      </div>

      {data ? (
        <>
          <DataTable<AuditEvent>
            caption={t("audit.title")}
            rows={data.items}
            columns={[
              { key: "seq", header: "#", render: (e) => <span className="font-mono text-2xs text-ink-faint">{e.seq}</span> },
              { key: "date", header: t("common.date"), render: (e) => <span className="font-mono text-2xs">{formatDateTime(e.createdAt, locale)}</span> },
              { key: "action", header: t("audit.action"), render: (e) => <span className="font-mono text-2xs text-ink">{e.action}</span> },
              { key: "actor", header: t("audit.actor"), render: (e) => e.actorName ?? e.actorId ?? "system" },
              { key: "cat", header: t("audit.category"), render: (e) => <StateLabel tone="neutral">{e.category}</StateLabel> },
              { key: "subject", header: t("audit.subject"), render: (e) => e.subjectPatientId?.slice(0, 8) ?? "—" },
            ]}
          />
          <TableFoot
            left={`${t("common.showing")} ${(data.page - 1) * data.limit + 1}–${(data.page - 1) * data.limit + data.items.length} ${t("common.of")} ${data.total}`}
            right={<Pagination page={data.page} pageCount={data.pageCount} onChange={setPage} />}
          />
        </>
      ) : (
        <p aria-busy="true" className="font-mono text-2xs text-ink-faint">{t("common.loading")}…</p>
      )}
    </section>
  );
};
