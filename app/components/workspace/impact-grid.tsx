import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { CheckCircle2, ClipboardCopy, Copy, Download, FileSpreadsheet } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { copyText, downloadCsv, downloadExcel, toTabSeparatedValues, withExportContext, type ExportContext, type GridRow } from "~/lib/grid-export";

ModuleRegistry.registerModules([AllCommunityModule]);

export const impactGridTheme = themeQuartz.withParams({
  accentColor: "var(--fabric-primary)",
  backgroundColor: "var(--bg-surface)",
  borderColor: "var(--border-default)",
  foregroundColor: "var(--text-primary)",
  headerBackgroundColor: "var(--bg-subtle)",
  headerTextColor: "var(--text-secondary)",
  rowHoverColor: "var(--bg-subtle)",
  wrapperBorder: false,
});

function abbreviate(value: string, length: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 3)}...` : clean;
}

function CopyableCell({ value }: ICellRendererParams<GridRow>) {
  const [copied, setCopied] = useState(false);
  const text = String(value ?? "--");

  async function copyValue(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    await copyText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <span className="group flex h-full min-w-0 items-center gap-1"><span className="min-w-0 truncate" title={text}>{abbreviate(text, 120)}</span><button type="button" aria-label="Copy cell value" title="Copy value" className="ml-auto hidden shrink-0 text-zinc-400 hover:text-teal-700 group-hover:inline-flex focus:inline-flex" onClick={(event) => void copyValue(event)}>{copied ? <CheckCircle2 className="size-3.5 text-emerald-700" /> : <Copy className="size-3.5" />}</button></span>;
}

export function ImpactGrid({ rowData, columnDefs, emptyMessage, exportFileName, exportContext }: {
  rowData: GridRow[];
  columnDefs: ColDef<GridRow>[];
  emptyMessage: string;
  exportFileName: string;
  exportContext: ExportContext;
}) {
  const [tableCopied, setTableCopied] = useState(false);

  async function copyTable() {
    await copyText(toTabSeparatedValues(withExportContext(rowData, exportContext)));
    setTableCopied(true);
    window.setTimeout(() => setTableCopied(false), 1800);
  }

  return <div className="overflow-x-auto border border-zinc-200">
    <div className="flex min-w-[720px] items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
      <span className="text-xs text-zinc-500">{rowData.length} {rowData.length === 1 ? "row" : "rows"}</span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" title="Copy all table values" disabled={!rowData.length} onClick={() => void copyTable()}>{tableCopied ? <CheckCircle2 className="size-3.5 text-emerald-700" /> : <ClipboardCopy className="size-3.5" />} {tableCopied ? "Copied" : "Copy table"}</Button>
        <Button type="button" variant="outline" size="sm" title="Download CSV" disabled={!rowData.length} onClick={() => downloadCsv(rowData, exportContext, exportFileName)}><Download className="size-3.5" /> CSV</Button>
        <Button type="button" variant="outline" size="sm" title="Download Excel-compatible file" disabled={!rowData.length} onClick={() => downloadExcel(rowData, exportContext, exportFileName)}><FileSpreadsheet className="size-3.5" /> Excel</Button>
      </div>
    </div>
    <div className="h-[420px] min-w-[720px]">
      <AgGridReact<GridRow> theme={impactGridTheme} rowData={rowData} columnDefs={columnDefs} defaultColDef={{ sortable: true, resizable: true, minWidth: 110, cellRenderer: CopyableCell }} rowHeight={42} headerHeight={40} suppressCellFocus={false} enableCellTextSelection ensureDomOrder overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${emptyMessage}</span>`} />
    </div>
  </div>;
}
