import Papa from "papaparse";

export interface ParsedSheet { headers: string[]; rows: Record<string, unknown>[] }

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export function parseCsv(text: string): ParsedSheet {
  const result = Papa.parse<Record<string, unknown>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  const headers = (result.meta.fields ?? []).filter((h) => h !== "");
  return { headers, rows: result.data.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== "")) };
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedSheet> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
  if (!ws) return { headers: [], rows: [] };
  const cellText = (v: unknown): unknown => {
    if (v == null) return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if ("result" in o) return cellText(o.result);
      if ("text" in o) return o.text;
      if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
      if ("hyperlink" in o) return o.text ?? o.hyperlink;
    }
    return v;
  };
  let headerRow = 1;
  while (headerRow <= Math.min(ws.rowCount, 10) && ws.getRow(headerRow).actualCellCount === 0) headerRow++;
  const headers: string[] = [];
  ws.getRow(headerRow).eachCell({ includeEmpty: true }, (cell, col) => { headers[col - 1] = String(cellText(cell.value) ?? "").trim(); });
  const rows: Record<string, unknown>[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.actualCellCount === 0) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { if (h) obj[h] = cellText(row.getCell(i + 1).value); });
    if (Object.values(obj).some((v) => v != null && String(v).trim() !== "")) rows.push(obj);
  }
  return { headers: headers.filter(Boolean), rows };
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  return Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? "")) });
}
