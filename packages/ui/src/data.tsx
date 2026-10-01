/**
 * Data display: dense editorial table, tabs and pagination.
 */
import { type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
  align?: "left" | "right";
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
  onRowClick,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  caption?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border-t-2 border-ink">
        <caption className="sr-only">{caption ?? "Data table"}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={`text-left font-mono text-2xs uppercase tracking-[0.06em] text-ink-faint font-normal px-2.5 py-3 border-b border-rule ${c.align === "right" ? "text-right" : ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter") onRowClick(row);
                    }
                  : undefined
              }
              className={`border-b border-rule ${onRowClick ? "cursor-pointer hover:bg-paper-deep/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`px-2.5 py-3.5 text-sm text-ink-soft ${c.align === "right" ? "text-right" : ""}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const TableFoot = ({ left, right }: { left: ReactNode; right?: ReactNode }) => (
  <div className="flex justify-between pt-4 font-mono text-2xs text-ink-faint">
    <span>{left}</span>
    {right ? <span className="flex gap-3 items-center">{right}</span> : null}
  </div>
);

export const Tabs = <T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) => (
  <div role="tablist" aria-label={label} className="flex gap-0 border-b border-rule overflow-x-auto">
    {tabs.map((t) => {
      const selected = t.id === active;
      return (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={selected}
          onClick={() => onChange(t.id)}
          className={`px-4 py-3 text-xs whitespace-nowrap border-b-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${
            selected ? "text-ink border-moss" : "text-ink-soft border-transparent hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      );
    })}
  </div>
);

export const Pagination = ({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) => (
  <nav aria-label="Pagination" className="flex gap-2 items-center font-mono text-2xs text-ink-faint">
    <button
      type="button"
      disabled={page <= 1}
      onClick={() => onChange(page - 1)}
      aria-label="Previous page"
      className="px-1.5 py-0.5 border border-rule hover:border-ink disabled:opacity-40 disabled:pointer-events-none"
    >
      ‹
    </button>
    <span aria-current="page">
      {page} / {pageCount}
    </span>
    <button
      type="button"
      disabled={page >= pageCount}
      onClick={() => onChange(page + 1)}
      aria-label="Next page"
      className="px-1.5 py-0.5 border border-rule hover:border-ink disabled:opacity-40 disabled:pointer-events-none"
    >
      ›
    </button>
  </nav>
);
