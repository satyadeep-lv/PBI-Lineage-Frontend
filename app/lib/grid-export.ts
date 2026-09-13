export type GridValue = string | number | boolean | null | undefined;
export type GridRow = { id: string; [key: string]: GridValue };
export type ExportContext = Record<string, string>;

export function withExportContext(rows: GridRow[], context: ExportContext) {
  return rows.map(({ id: _id, ...row }) => ({ ...context, ...row }));
}

export function collectColumns(rows: Array<Record<string, GridValue>>) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

export function toTabSeparatedValues(rows: Array<Record<string, GridValue>>) {
  const columns = collectColumns(rows);
  return [columns.join("\t"), ...rows.map((row) => columns.map((column) => String(row[column] ?? "").replace(/[\t\r\n]+/g, " ")).join("\t"))].join("\n");
}

function csvCell(value: GridValue) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function downloadCsv(rows: GridRow[], context: ExportContext, baseName: string) {
  const data = withExportContext(rows, context);
  const columns = collectColumns(data);
  const csv = [columns.join(","), ...data.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
  downloadBlob(`${String.fromCharCode(0xfeff)}${csv}`, "text/csv;charset=utf-8", `${filePart(baseName)}.csv`);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function downloadExcel(rows: GridRow[], context: ExportContext, baseName: string) {
  const data = withExportContext(rows, context);
  const columns = collectColumns(data);
  const table = `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${data.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(String(row[column] ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  downloadBlob(`<!doctype html><html><head><meta charset="utf-8"></head><body>${table}</body></html>`, "application/vnd.ms-excel;charset=utf-8", `${filePart(baseName)}.xls`);
}

function downloadBlob(content: string, type: string, fileName: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function filePart(value: string | undefined) {
  return (value ?? "lineage-export").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "lineage-export";
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}
