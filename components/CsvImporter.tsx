"use client";

import { useState } from "react";
import Papa from "papaparse";
import { UploadCloud, Check } from "lucide-react";
import { Button } from "@/components/ui";

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
}

export function CsvImporter({
  fields,
  onCommit,
  entityLabel,
}: {
  fields: ImportField[];
  entityLabel: string;
  onCommit: (rows: Record<string, string>[]) => Promise<void>;
}) {
  const [rawRows, setRawRows] = useState<Record<string, string>[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [committing, setCommitting] = useState(false);
  const [done, setDone] = useState(0);

  function handleFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data;
        setRawRows(data);
        const cols = results.meta.fields ?? [];
        setHeaders(cols);
        // best-effort auto-map by matching names loosely
        const auto: Record<string, string> = {};
        for (const f of fields) {
          const match = cols.find(
            (c) => c.toLowerCase().replace(/[^a-z0-9]/g, "") === f.key.toLowerCase().replace(/[^a-z0-9]/g, "")
          );
          if (match) auto[f.key] = match;
        }
        setMapping(auto);
        setDone(0);
      },
    });
  }

  async function commit() {
    if (!rawRows) return;
    setCommitting(true);
    const mapped = rawRows.map((row) => {
      const out: Record<string, string> = {};
      for (const f of fields) {
        out[f.key] = mapping[f.key] ? row[mapping[f.key]] ?? "" : "";
      }
      return out;
    });
    await onCommit(mapped);
    setCommitting(false);
    setDone(mapped.length);
    setRawRows(null);
    setHeaders([]);
    setMapping({});
  }

  return (
    <div className="space-y-4">
      {!rawRows ? (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border-subtle rounded-xl py-8 cursor-pointer hover:border-accent-green text-center">
          <UploadCloud size={28} className="text-text-muted" />
          <span className="text-sm font-medium text-navy-900">Upload {entityLabel} CSV</span>
          <span className="text-xs text-text-muted">Click to choose a .csv file exported from Excel</span>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            Found {rawRows.length} row(s). Match each field below to a column from your file.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-navy-900 mb-1.5">
                  {f.label}
                  {f.required && <span className="text-danger"> *</span>}
                </label>
                <select
                  className="w-full border border-border-subtle rounded-lg px-3 py-2 text-sm"
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                >
                  <option value="">Not mapped / skip</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto border border-border-subtle rounded-lg max-h-48">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-muted">
                  {headers.map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium text-navy-900 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t border-border-subtle">
                    {headers.map((h) => (
                      <td key={h} className="px-2 py-1.5 whitespace-nowrap text-text-muted">
                        {row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRawRows(null)}>
              Cancel
            </Button>
            <Button onClick={commit} disabled={committing}>
              {committing ? "Importing…" : `Import ${rawRows.length} row(s)`}
            </Button>
          </div>
        </div>
      )}

      {done > 0 && (
        <p className="text-sm text-accent-green-dark font-medium flex items-center gap-1.5">
          <Check size={15} /> Imported {done} {entityLabel.toLowerCase()} record(s).
        </p>
      )}
    </div>
  );
}
