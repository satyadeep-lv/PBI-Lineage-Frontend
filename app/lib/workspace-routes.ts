/**
 * `/workspace/:section` slugs that render a working screen. Every other slug
 * (`api-docs` or an API group tag) is the API reference, which the header files
 * under Documents and the workspace route renders without the workspace nav.
 */
export const WORKSPACE_SECTIONS = new Set([
  "power-bi",
  "database",
  "overview",
  "explorer",
  "report-lineage",
  "table-impact",
  "measure-impact",
  "scanner",
]);

export function isApiReferencePath(pathname: string) {
  const section = /^\/workspace\/([^/]+)/.exec(pathname)?.[1];
  return section !== undefined && !WORKSPACE_SECTIONS.has(section);
}

/**
 * Explorer opened on one workspace, optionally with a report (Reports tab) or a
 * semantic model (the Semantic objects section of a report bound to it) already
 * selected. Explorer reads these search params once, when it mounts.
 */
export function explorerHref({ workspaceId, reportId, semanticModelId }: { workspaceId: string; reportId?: string; semanticModelId?: string }) {
  const params = new URLSearchParams({ workspace: workspaceId });
  if (reportId) params.set("report", reportId);
  if (semanticModelId) params.set("model", semanticModelId);
  return `/workspace/explorer?${params.toString()}`;
}
