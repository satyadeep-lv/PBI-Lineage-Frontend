import { requestJson } from "~/lib/lineage-api";

export type ScannerErrorDetail = { code?: string | null; message?: string | null; target?: string | null };

export type ScannerScanResponse = {
  scan_id: string;
  created_at: string;
  status: string;
  error?: ScannerErrorDetail | null;
};

export type ScannerResultSummary = {
  workspace_count: number;
  report_count: number;
  dashboard_count: number;
  semantic_model_count: number;
  dataflow_count: number;
  datamart_count: number;
  table_count: number;
  column_count: number;
  measure_count: number;
  relationship_count: number;
  role_count: number;
  dataset_expression_count: number;
  table_source_expression_count: number;
  datasource_instance_count: number;
  misconfigured_datasource_instance_count: number;
};

/**
 * Full, defensive TypeScript model of Microsoft's real Power BI Admin scanner payload
 * (WorkspaceInfoResponse — see
 * https://learn.microsoft.com/en-us/rest/api/power-bi/admin/workspace-info-get-scan-result).
 * The backend does not validate or narrow this JSON (`ScannerResultResponse.payload:
 * dict[str, Any]`) — every field here must be treated as possibly absent. Field names/shapes are
 * taken verbatim from that reference page's "Definitions" section.
 */
export type ScannerEndorsementDetails = { endorsement?: string; certifiedBy?: string };
export type ScannerSensitivityLabel = { labelId?: string };
export type ScannerServicePrincipalProfile = { id?: string; displayName?: string };

/** Unifies GroupUser/ReportUser/DashboardUser/DatasetUser/DataflowUser/DatamartUser — same shape
 * per Microsoft's docs, differing only in which "*AccessRight" field name each carries. */
export type ScannerUserAccess = {
  displayName?: string;
  emailAddress?: string;
  identifier?: string;
  graphId?: string;
  principalType?: string;
  userType?: string;
  profile?: ScannerServicePrincipalProfile;
  groupUserAccessRight?: string;
  reportUserAccessRight?: string;
  dashboardUserAccessRight?: string;
  DataflowUserAccessRight?: string;
  datasetUserAccessRight?: string;
  datamartUserAccessRight?: string;
};

export type ScannerDependentDataflow = { groupId?: string; targetDataflowId?: string };
export type ScannerDependentDatamart = { groupId?: string; targetDatamartId?: string };
export type ScannerDependentDataset = { groupId?: string; targetDatasetId?: string };
export type ScannerDatasourceUsage = { datasourceInstanceId?: string };

export type ScannerDatasourceConnectionDetails = {
  account?: string;
  classInfo?: string;
  database?: string;
  domain?: string;
  emailAddress?: string;
  kind?: string;
  loginServer?: string;
  path?: string;
  server?: string;
  url?: string;
};

/** `Datasource` — used for both `datasourceInstances[]` and `misconfiguredDatasourceInstances[]`. */
export type ScannerDatasourceInstance = {
  datasourceId?: string;
  datasourceType?: string;
  gatewayId?: string;
  connectionDetails?: ScannerDatasourceConnectionDetails;
  /** Deprecated fields, DirectQuery-only per the docs — still modeled for completeness. */
  connectionString?: string;
  name?: string;
};

export type ScannerRoleMember = { memberName?: string; memberId?: string; memberType?: string; identityProvider?: string };
export type ScannerRoleTablePermission = { name?: string; filterExpression?: string };
export type ScannerRole = { name?: string; modelPermission?: string; members?: ScannerRoleMember[]; tablePermissions?: ScannerRoleTablePermission[] };

/**
 * Not documented as its own type on the GetScanResult reference page (its Definitions table has
 * no "Relationship" entry even though the sample response includes a `relationships` array per
 * dataset) — fields below follow Power BI's well-known relationship shape and are read
 * defensively, same as everything else in this untyped payload.
 */
export type ScannerRelationship = {
  name?: string;
  fromTable?: string;
  fromColumn?: string;
  toTable?: string;
  toColumn?: string;
  crossFilteringBehavior?: string;
  isActive?: boolean;
  securityFilteringBehavior?: string;
};

export type ScannerExpression = { name?: string; description?: string; expression?: string };
export type ScannerColumn = { name: string; dataType?: string; dataCategory?: string; formatString?: string; isHidden?: boolean; sortByColumn?: string; summarizeBy?: string };
export type ScannerMeasure = { name: string; expression?: string; description?: string; formatString?: string; isHidden?: boolean };
export type ScannerTableSource = { expression?: string };
export type ScannerRow = { id?: string };
export type ScannerTable = {
  name: string;
  description?: string;
  isHidden?: boolean;
  columns?: ScannerColumn[];
  measures?: ScannerMeasure[];
  source?: ScannerTableSource[];
  rows?: ScannerRow[];
};

export type ScannerDataset = {
  id: string;
  name: string;
  description?: string;
  configuredBy?: string;
  createdDate?: string;
  targetStorageMode?: string;
  contentProviderType?: string;
  schemaMayNotBeUpToDate?: boolean;
  schemaRetrievalError?: string;
  endorsementDetails?: ScannerEndorsementDetails;
  sensitivityLabel?: ScannerSensitivityLabel;
  tags?: string[];
  tables?: ScannerTable[];
  relationships?: ScannerRelationship[];
  roles?: ScannerRole[];
  expressions?: ScannerExpression[];
  datasourceUsages?: ScannerDatasourceUsage[];
  misconfiguredDatasourceUsages?: ScannerDatasourceUsage[];
  upstreamDataflows?: ScannerDependentDataflow[];
  upstreamDatamarts?: ScannerDependentDatamart[];
  upstreamDatasets?: ScannerDependentDataset[];
  users?: ScannerUserAccess[];
};

export type ScannerDashboardTile = { id: string; title?: string; datasetId?: string; datasetWorkspaceId?: string; reportId?: string };
export type ScannerDashboard = {
  id: string;
  displayName: string;
  appId?: string | null;
  isReadOnly?: boolean;
  dataClassification?: string;
  sensitivityLabel?: ScannerSensitivityLabel;
  tags?: string[];
  tiles?: ScannerDashboardTile[];
  users?: ScannerUserAccess[];
};

export type ScannerReport = {
  id: string;
  name: string;
  appId?: string | null;
  datasetId?: string | null;
  datasetWorkspaceId?: string;
  description?: string;
  format?: string;
  reportType?: string;
  createdBy?: string;
  createdById?: string;
  createdDateTime?: string;
  modifiedBy?: string;
  modifiedById?: string;
  modifiedDateTime?: string;
  isOwnedByMe?: boolean;
  originalReportId?: string;
  endorsementDetails?: ScannerEndorsementDetails;
  sensitivityLabel?: ScannerSensitivityLabel;
  tags?: string[];
  users?: ScannerUserAccess[];
};

export type ScannerDataflow = {
  objectId: string;
  name: string;
  description?: string;
  configuredBy?: string;
  modifiedBy?: string;
  modifiedDateTime?: string;
  modelUrl?: string;
  endorsementDetails?: ScannerEndorsementDetails;
  sensitivityLabel?: ScannerSensitivityLabel;
  tags?: string[];
  datasourceUsages?: ScannerDatasourceUsage[];
  misconfiguredDatasourceUsages?: ScannerDatasourceUsage[];
  upstreamDataflows?: ScannerDependentDataflow[];
  upstreamDatamarts?: ScannerDependentDatamart[];
  users?: ScannerUserAccess[];
};

export type ScannerDatamart = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  state?: string;
  status?: string;
  suspendedBatchId?: string;
  configuredBy?: string;
  configuredById?: string;
  modifiedBy?: string;
  modifiedById?: string;
  modifiedDateTime?: string;
  endorsementDetails?: ScannerEndorsementDetails;
  sensitivityLabel?: ScannerSensitivityLabel;
  tags?: string[];
  datasourceUsages?: ScannerDatasourceUsage[];
  upstreamDataflows?: ScannerDependentDataflow[];
  upstreamDatamarts?: ScannerDependentDatamart[];
  users?: ScannerUserAccess[];
};

export type ScannerWorkspace = {
  id: string;
  name: string;
  type?: string;
  state?: string;
  isOnDedicatedCapacity?: boolean;
  capacityId?: string;
  defaultDatasetStorageFormat?: string;
  description?: string;
  dataRetrievalState?: string;
  tags?: Array<{ id: string }>;
  users?: ScannerUserAccess[];
  reports?: ScannerReport[];
  dashboards?: ScannerDashboard[];
  datasets?: ScannerDataset[];
  dataflows?: ScannerDataflow[];
  datamarts?: ScannerDatamart[];
};

export type ScannerPayload = {
  workspaces?: ScannerWorkspace[];
  datasourceInstances?: ScannerDatasourceInstance[];
  misconfiguredDatasourceInstances?: ScannerDatasourceInstance[];
};

export type ScannerResultResponse = {
  scan_id: string;
  sections: string[];
  summary: ScannerResultSummary;
  payload: ScannerPayload;
};

export type ScanFlags = {
  lineage?: boolean;
  datasource_details?: boolean;
  dataset_schema?: boolean;
  dataset_expressions?: boolean;
  get_artifact_users?: boolean;
};

/** Matches the backend's own defaults (`ScannerWorkspaceScanRequest`). `get_artifact_users` is
 * never set to true anywhere in this app: it can return user identifiers. */
export const DEFAULT_SCAN_FLAGS: Required<ScanFlags> = {
  lineage: true,
  datasource_details: true,
  dataset_schema: true,
  dataset_expressions: true,
  get_artifact_users: false,
};

export function startScan(apiOrigin: string, workspaceIds: string[], flags: ScanFlags = DEFAULT_SCAN_FLAGS) {
  return requestJson<ScannerScanResponse>(apiOrigin, "/api/v1/scanner/workspaces/scan", {
    method: "POST",
    body: JSON.stringify({ workspaces: workspaceIds, ...DEFAULT_SCAN_FLAGS, ...flags, get_artifact_users: false }),
  });
}

export function getScanStatus(apiOrigin: string, scanId: string) {
  return requestJson<ScannerScanResponse>(apiOrigin, `/api/v1/scanner/scans/${scanId}/status`);
}

export function getScanResult(apiOrigin: string, scanId: string) {
  return requestJson<ScannerResultResponse>(apiOrigin, `/api/v1/scanner/scans/${scanId}/result`);
}

export function workspacePayload(result: ScannerResultResponse | undefined, workspaceId: string): ScannerWorkspace | undefined {
  return result?.payload.workspaces?.find((workspace) => workspace.id === workspaceId);
}
