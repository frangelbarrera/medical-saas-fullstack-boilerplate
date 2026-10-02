/**
 * Patients: server-side search with debounce, dense editorial table with the
 * minimum-necessary projection, pagination, add-patient modal.
 */
import { useCallback, useEffect, useState } from "react";
import type { Paginated, PatientListItem } from "@medical/contracts";
import { api, ApiProblem } from "../lib/api.js";
import { useSession } from "../auth/index.js";
import { useI18n } from "../i18n/index.js";
import { formatDate } from "../lib/format.js";
import {
  Banner,
  Button,
  DataTable,
  EmptyState,
  Input,
  Kicker,
  Modal,
  Pagination,
  Select,
  StateLabel,
  TableFoot,
  Textarea,
  useToast,
} from "@medical/ui";
import { navigate } from "../routes.js";

const IDENTIFIER_TYPES = ["INTERNAL", "PASSPORT", "NATIONAL_ID", "INSURANCE"] as const;
const SEXES = ["female", "male", "other", "unknown"] as const;

export const PatientsView = () => {
  const { t, locale } = useI18n();
  const { can, profile } = useSession();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<PatientListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await api.patients({ q: query.trim(), page, limit: 20 });
      setData(result);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 240);
    return () => clearTimeout(timer);
  }, [load]);

  const openRecord = (row: PatientListItem) => navigate(`/patients/${row.id}/record`);

  return (
    <section aria-label={t("patients.title")}>
      <div className="flex items-end justify-between mb-8 max-md:flex-col max-md:items-start max-md:gap-5">
        <div>
          <Kicker>
            {(profile?.clinic.name ?? "").toUpperCase()} / {data ? `${data.total} ${t("common.records").toUpperCase()}` : ""}
          </Kicker>
          <h1 className="font-serif text-3xl m-0 text-ink mt-2">
            {t("patients.title")}<span className="text-moss">.</span>
          </h1>
          <p className="text-sm text-ink-soft mt-3 mb-0">{t("patients.lede")}</p>
        </div>
        {can("patients:phi_write") ? (
          <Button variant="action" arrow onClick={() => setModalOpen(true)}>{t("patients.add")}</Button>
        ) : null}
      </div>

      <div className="flex gap-2 border-t-2 border-ink border-b border-rule py-3 mb-6">
        <div className="flex items-center gap-2 border-b border-ink pr-2 pb-1.5 w-[320px] max-w-full">
          <span aria-hidden="true" className="text-base text-ink-faint">⌕</span>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder={t("patients.searchPlaceholder")}
            aria-label={t("patients.searchPlaceholder")}
            className="border-0 bg-transparent outline-none flex-1 text-sm"
          />
          <kbd className="font-mono text-2xs text-ink-faint">/</kbd>
        </div>
      </div>

      {failed ? <Banner tone="danger">{t("common.error")}</Banner> : null}

      {loading && !data ? (
        <p className="font-mono text-2xs text-ink-faint" aria-busy="true">{t("common.loading")}…</p>
      ) : data ? (
        <>
          <DataTable<PatientListItem>
            caption={t("patients.title")}
            rows={data.items}
            onRowClick={openRecord}
            empty={
              <EmptyState
                title={t("patients.noResults")}
                body={t("patients.noResultsBody")}
              />
            }
            columns={[
              {
                key: "name",
                header: t("common.name"),
                render: (row) => (
                  <span>
                    <strong className="block text-ink font-semibold">{row.fullName}</strong>
                    <small className="block font-mono text-2xs text-ink-faint mt-1">
                      {row.internalRef}{row.birthYear ? ` · ${row.birthYear}` : ""}
                    </small>
                  </span>
                ),
              },
              {
                key: "care",
                header: t("patients.careTeam"),
                render: (row) => row.primaryDoctorName ?? "—",
              },
              {
                key: "lastVisit",
                header: t("patients.lastVisit"),
                render: (row) => formatDate(row.lastVisitAt, locale),
              },
              {
                key: "status",
                header: t("common.status"),
                render: (row) => (
                  <StateLabel tone={row.status === "ACTIVE" ? "good" : "neutral"}>
                    {row.status === "ACTIVE" ? t("patients.statusActive") : row.status === "INACTIVE" ? t("patients.statusInactive") : t("patients.statusArchived")}
                  </StateLabel>
                ),
              },
              { key: "open", header: "", render: () => <span aria-hidden>↗</span>, width: "24px" },
            ]}
          />
          {data.items.length > 0 ? (
            <TableFoot
              left={`${t("common.showing")} ${(data.page - 1) * data.limit + 1}–${(data.page - 1) * data.limit + data.items.length} ${t("common.of")} ${data.total} ${t("common.records")}`}
              right={<Pagination page={data.page} pageCount={data.pageCount} onChange={setPage} />}
            />
          ) : null}
        </>
      ) : null}

      <AddPatientModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={async (name) => {
          toast(`${name} · ${t("common.saved")}`, "success");
          setModalOpen(false);
          setQuery("");
          setPage(1);
          await load();
        }}
      />
    </section>
  );
};

const AddPatientModal = ({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (name: string) => Promise<void>;
}) => {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<string>("unknown");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [identType, setIdentType] = useState<string>("NATIONAL_ID");
  const [identValue, setIdentValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFullName(""); setBirthDate(""); setSex("unknown"); setPhone(""); setEmail(""); setAddress(""); setIdentValue(""); setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createPatient({
        fullName: fullName.trim(),
        birthDate: birthDate || undefined,
        sex: sex === "unknown" ? undefined : sex,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        identifiers: identValue.trim() ? [{ type: identType, value: identValue.trim(), isPrimary: true }] : [],
      });
      await onSaved(fullName.trim());
      reset();
    } catch (err) {
      setError(err instanceof ApiProblem ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker={t("patients.add").toUpperCase()}
      title={t("patients.add")}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="action" disabled={busy || !fullName.trim()} onClick={() => void submit()}>{t("common.create")}</Button>
        </>
      }
    >
      {error ? <div className="mb-4"><Banner tone="warning">{error}</Banner></div> : null}
      <div className="grid grid-cols-2 gap-5 max-sm:grid-cols-1">
        <Input label={t("common.name")} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <Input label={t("patients.birthDate")} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        <Select label={t("patients.sex")} value={sex} onChange={(e) => setSex(e.target.value)}>
          {SEXES.map((s) => <option key={s} value={s}>{t(`patients.sex.${s}` as "patients.sex.female")}</option>)}
        </Select>
        <Input label={t("patients.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        <Input label={t("patients.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select label={t("patients.identifierType")} value={identType} onChange={(e) => setIdentType(e.target.value)}>
          {IDENTIFIER_TYPES.map((ty) => <option key={ty} value={ty}>{ty.replace(/_/g, " ").toLowerCase()}</option>)}
        </Select>
        <Input label={t("patients.identifierValue")} value={identValue} onChange={(e) => setIdentValue(e.target.value)} />
        <div className="col-span-2">
          <Textarea label={t("patients.address")} rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
};
