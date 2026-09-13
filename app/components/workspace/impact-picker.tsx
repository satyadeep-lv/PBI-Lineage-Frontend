import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Checkbox } from "~/components/ui/checkbox";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "~/components/ui/command";
import { cn } from "~/lib/utils";

export type ScopeWorkspace = { id: string; name: string };

export function WorkspaceScopeSelect({ id, label, workspaces, selectedIds, onChange }: {
  id: string;
  label: string;
  workspaces: ScopeWorkspace[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const selected = new Set(selectedIds);
  const visible = filter.trim()
    ? workspaces.filter((workspace) => workspace.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()))
    : workspaces;

  function toggle(workspaceId: string, checked: boolean) {
    onChange(checked ? [...selectedIds, workspaceId] : selectedIds.filter((id) => id !== workspaceId));
  }

  const summary = !workspaces.length
    ? "No workspaces"
    : selectedIds.length === workspaces.length
      ? `All ${workspaces.length} workspaces`
      : selectedIds.length === 0
        ? "No workspaces selected"
        : `${selectedIds.length} of ${workspaces.length} selected`;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-zinc-600" id={`${id}-label`}>{label}</p>
      <button
        type="button"
        aria-labelledby={`${id}-label`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-3 text-xs font-medium text-teal-700">
              <button type="button" onClick={() => onChange(workspaces.map((workspace) => workspace.id))}>Select all</button>
              <button type="button" onClick={() => onChange([])}>Clear</button>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-zinc-500 hover:text-zinc-950">Done</button>
          </div>
          {workspaces.length > 8 && (
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter workspaces..."
              className="h-8 w-full rounded border border-zinc-200 px-2 text-xs outline-none focus:border-teal-700"
            />
          )}
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {visible.map((workspace) => (
              <label key={workspace.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-zinc-50">
                <Checkbox checked={selected.has(workspace.id)} onCheckedChange={(checked) => toggle(workspace.id, checked)} />
                <span className="min-w-0 truncate">{workspace.name}</span>
              </label>
            ))}
            {!visible.length && <p className="px-1.5 py-2 text-xs text-zinc-500">No workspaces match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export type SearchEntry = {
  key: string;
  /** Composite text cmdk filters/searches against (name + model + workspace). */
  searchValue: string;
  primary: string;
  secondary: string;
};

export function ObjectSearchSelect({ id, label, placeholder, entries, selectedKey, onChange, emptyText }: {
  id: string;
  label: string;
  placeholder: string;
  entries: SearchEntry[];
  selectedKey: string;
  onChange: (key: string) => void;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedEntry = entries.find((entry) => entry.key === selectedKey) ?? null;
  const visible = entries.slice(0, 200);
  const truncated = entries.length > visible.length;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-zinc-600" id={`${id}-label`}>{label}</p>
      <button
        type="button"
        aria-labelledby={`${id}-label`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
      >
        <span className="min-w-0 truncate text-left">{selectedEntry ? selectedEntry.primary : <span className="text-zinc-400">{placeholder}</span>}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {selectedEntry && <p className="truncate text-xs text-zinc-500">{selectedEntry.secondary}</p>}
      {open && (
        <div className="border border-zinc-200 bg-white shadow-sm">
          <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>{entries.length ? "No matches." : emptyText}</CommandEmpty>
              {visible.map((entry) => (
                <CommandItem key={entry.key} value={entry.searchValue} onSelect={() => { onChange(entry.key); setOpen(false); }}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{entry.primary}</span>
                    <span className="truncate text-xs text-zinc-500">{entry.secondary}</span>
                  </span>
                </CommandItem>
              ))}
              {truncated && <p className="px-3 py-2 text-xs text-zinc-500">Showing first 200 matches — refine your search.</p>}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
