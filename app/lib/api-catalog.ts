export const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type OpenApiParameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: {
    type?: string;
    default?: unknown;
    enum?: string[];
  };
};

type OpenApiSchema = {
  $ref?: string;
  type?: string;
  format?: string;
  default?: unknown;
  example?: unknown;
  enum?: unknown[];
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
};

type OpenApiMediaType = {
  schema?: OpenApiSchema;
  example?: unknown;
};

type OpenApiRequestBody = {
  required?: boolean;
  content?: Record<string, OpenApiMediaType>;
};

type OpenApiOperation = {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
};

export type OpenApiDocument = {
  info?: {
    title?: string;
    version?: string;
  };
  paths: Record<string, Partial<Record<HttpMethod, OpenApiOperation>>>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
};

export type ApiEndpoint = {
  id: string;
  method: HttpMethod;
  path: string;
  tag: string;
  summary: string;
  description: string;
  operationId: string;
  parameters: OpenApiParameter[];
  hasBody: boolean;
  requestBodyRequired?: boolean;
  requestBodyTemplate?: string;
};

export type ApiResult = {
  endpoint: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  body: unknown;
  headers: Record<string, string>;
};

export const SETUP_ENDPOINTS = {
  databaseConnect: "POST /api/v1/auth/snowflake/session",
  databaseStatus: "GET /api/v1/auth/snowflake/session/status",
  databaseLogout: "DELETE /api/v1/auth/snowflake/session",
  powerBiStart: "POST /api/v1/auth/microsoft/device/start",
  powerBiSessionStatus: "GET /api/v1/auth/microsoft/device/{session_id}/status",
  powerBiStatus: "GET /api/v1/auth/microsoft/device/status",
  powerBiLogout: "POST /api/v1/auth/microsoft/device/logout",
  powerBiServicePrincipalConnect: "POST /api/v1/auth/microsoft/service-principal/session",
  powerBiServicePrincipalStatus: "GET /api/v1/auth/microsoft/service-principal/session/status",
  powerBiServicePrincipalLogout: "DELETE /api/v1/auth/microsoft/service-principal/session",
};

export const SETUP_ENDPOINT_DEFINITIONS: ApiEndpoint[] = [
  {
    id: SETUP_ENDPOINTS.powerBiStart,
    method: "post",
    path: "/api/v1/auth/microsoft/device/start",
    tag: "Authentication",
    summary: "Start Microsoft device authentication",
    description: "Starts the Microsoft device-code flow for Power BI and Fabric.",
    operationId: "start_microsoft_device_authentication",
    parameters: [],
    hasBody: true,
  },
  {
    id: SETUP_ENDPOINTS.powerBiSessionStatus,
    method: "get",
    path: "/api/v1/auth/microsoft/device/{session_id}/status",
    tag: "Authentication",
    summary: "Get Microsoft device authentication status",
    description: "Checks the status of a specific device-code session.",
    operationId: "get_microsoft_device_authentication_status",
    parameters: [{ name: "session_id", in: "path", required: true }],
    hasBody: false,
  },
  {
    id: SETUP_ENDPOINTS.powerBiStatus,
    method: "get",
    path: "/api/v1/auth/microsoft/device/status",
    tag: "Authentication",
    summary: "Get Microsoft device authentication status",
    description: "Checks the authenticated browser session.",
    operationId: "get_microsoft_device_auth_status",
    parameters: [],
    hasBody: false,
  },
  {
    id: SETUP_ENDPOINTS.powerBiLogout,
    method: "post",
    path: "/api/v1/auth/microsoft/device/logout",
    tag: "Authentication",
    summary: "Logout Microsoft device session",
    description: "Clears the Microsoft device-code session.",
    operationId: "logout_microsoft_device_session",
    parameters: [],
    hasBody: false,
  },
  {
    id: SETUP_ENDPOINTS.powerBiServicePrincipalConnect,
    method: "post",
    path: "/api/v1/auth/microsoft/service-principal/session",
    tag: "Authentication",
    summary: "Authenticate Microsoft service principal",
    description: "Creates a Power BI and Fabric application-token session using a client secret.",
    operationId: "authenticate_microsoft_service_principal",
    parameters: [],
    hasBody: true,
  },
  {
    id: SETUP_ENDPOINTS.powerBiServicePrincipalStatus,
    method: "get",
    path: "/api/v1/auth/microsoft/service-principal/session/status",
    tag: "Authentication",
    summary: "Get Microsoft service principal status",
    description: "Checks Power BI and Fabric application-token availability.",
    operationId: "get_microsoft_service_principal_status",
    parameters: [],
    hasBody: false,
  },
  {
    id: SETUP_ENDPOINTS.powerBiServicePrincipalLogout,
    method: "delete",
    path: "/api/v1/auth/microsoft/service-principal/session",
    tag: "Authentication",
    summary: "Logout Microsoft service principal",
    description: "Clears the Microsoft application-token session.",
    operationId: "logout_microsoft_service_principal",
    parameters: [],
    hasBody: false,
  },
  {
    id: SETUP_ENDPOINTS.databaseConnect,
    method: "post",
    path: "/api/v1/auth/snowflake/session",
    tag: "Authentication",
    summary: "Authenticate Snowflake",
    description: "Creates a Snowflake authentication session.",
    operationId: "authenticate_snowflake",
    parameters: [],
    hasBody: true,
  },
  {
    id: SETUP_ENDPOINTS.databaseStatus,
    method: "get",
    path: "/api/v1/auth/snowflake/session/status",
    tag: "Authentication",
    summary: "Snowflake authentication status",
    description: "Checks the Snowflake browser session.",
    operationId: "snowflake_authentication_status",
    parameters: [],
    hasBody: false,
  },
  {
    id: SETUP_ENDPOINTS.databaseLogout,
    method: "delete",
    path: "/api/v1/auth/snowflake/session",
    tag: "Authentication",
    summary: "Logout Snowflake",
    description: "Clears the Snowflake browser session.",
    operationId: "logout_snowflake",
    parameters: [],
    hasBody: false,
  },
];

export const DEFAULT_REQUEST_BODIES: Record<string, string> = {
  [SETUP_ENDPOINTS.databaseConnect]: JSON.stringify(
    {
      authentication_method: "password",
      account_identifier: "",
      user: "",
      password: "",
      warehouse: "",
      database: "",
      schema_name: "",
      role: "",
    },
    null,
    2,
  ),
  [SETUP_ENDPOINTS.powerBiStart]: JSON.stringify(
    { tenant_id: "", client_id: "" },
    null,
    2,
  ),
  [SETUP_ENDPOINTS.powerBiServicePrincipalConnect]: JSON.stringify(
    { tenant_id: "", client_id: "", client_secret: "" },
    null,
    2,
  ),
  "POST /api/v1/lineage/snowflake/trace": JSON.stringify(
    {
      object_name: "DATABASE.SCHEMA.TABLE_NAME",
      object_domain: "TABLE",
      direction: "UPSTREAM",
      max_depth: 5,
      include_processes: true,
      max_queries: 25,
      max_nodes: 1000,
      max_edges: 2000,
      max_concurrency: 4,
    },
    null,
    2,
  ),
  "POST /api/v1/lineage/live-graphs": JSON.stringify(
    {
      workspace_id: "",
      report_ids: [],
      semantic_model_ids: [],
      include_snowflake: false,
    },
    null,
    2,
  ),
  "POST /api/v1/lineage/scan-jobs/live": JSON.stringify(
    {
      workspace_id: "",
      report_ids: [],
      semantic_model_ids: [],
      include_snowflake: false,
    },
    null,
    2,
  ),
};

export async function fetchOpenApi(apiOrigin: string): Promise<OpenApiDocument> {
  const response = await fetch(`${apiOrigin}/openapi.json`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`OpenAPI request failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<OpenApiDocument>;
}

export async function readJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function flattenEndpoints(openApi: OpenApiDocument | undefined) {
  if (!openApi?.paths) {
    return [];
  }

  return Object.entries(openApi.paths)
    .flatMap(([path, operations]) =>
      HTTP_METHODS.flatMap((method) => {
        const operation = operations[method];

        if (!operation) {
          return [];
        }

        return [
          {
            id: `${method.toUpperCase()} ${path}`,
            method,
            path,
            tag: operation.tags?.[0] ?? "Other",
            summary: operation.summary ?? path,
            description: operation.description ?? "",
            operationId: operation.operationId ?? `${method}_${path}`,
            parameters: operation.parameters ?? [],
            hasBody: Boolean(operation.requestBody),
            requestBodyRequired: operation.requestBody?.required,
            requestBodyTemplate: operation.requestBody
              ? buildRequestBodyTemplate(openApi, operation.requestBody)
              : undefined,
          } satisfies ApiEndpoint,
        ];
      }),
    )
    .sort((first, second) => {
      const tagOrder = first.tag.localeCompare(second.tag);
      return tagOrder || first.path.localeCompare(second.path);
    });
}

function buildRequestBodyTemplate(document: OpenApiDocument, requestBody: OpenApiRequestBody) {
  const mediaType = requestBody.content?.["application/json"]
    ?? Object.values(requestBody.content ?? {})[0];
  const example = mediaType?.example
    ?? (mediaType?.schema ? exampleForSchema(document, mediaType.schema, new Set()) : {});

  return JSON.stringify(example ?? {}, null, 2);
}

function exampleForSchema(
  document: OpenApiDocument,
  schema: OpenApiSchema,
  visitedReferences: Set<string>,
): unknown {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];

  if (schema.$ref) {
    if (visitedReferences.has(schema.$ref)) return {};
    const referencedSchema = resolveSchemaReference(document, schema.$ref);
    if (!referencedSchema) return {};
    const nextVisited = new Set(visitedReferences);
    nextVisited.add(schema.$ref);
    return exampleForSchema(document, referencedSchema, nextVisited);
  }

  if (schema.allOf?.length) {
    return schema.allOf.reduce<Record<string, unknown>>((combined, item) => {
      const value = exampleForSchema(document, item, visitedReferences);
      return typeof value === "object" && value !== null && !Array.isArray(value)
        ? { ...combined, ...(value as Record<string, unknown>) }
        : combined;
    }, {});
  }

  const option = [...(schema.oneOf ?? []), ...(schema.anyOf ?? [])]
    .find((item) => item.type !== "null");
  if (option) return exampleForSchema(document, option, visitedReferences);

  if (schema.type === "object" || schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([name, property]) => [
        name,
        exampleForSchema(document, property, visitedReferences),
      ]),
    );
  }
  if (schema.type === "array") {
    return schema.items ? [exampleForSchema(document, schema.items, visitedReferences)] : [];
  }
  if (schema.type === "boolean") return false;
  if (schema.type === "integer" || schema.type === "number") return 0;
  return "";
}

function resolveSchemaReference(document: OpenApiDocument, reference: string) {
  const prefix = "#/components/schemas/";
  if (!reference.startsWith(prefix)) return undefined;
  const name = decodeURIComponent(reference.slice(prefix.length).replace(/~1/g, "/").replace(/~0/g, "~"));
  return document.components?.schemas?.[name];
}

export function getParameterDefault(parameter: OpenApiParameter) {
  if (parameter.schema?.default !== undefined) {
    return String(parameter.schema.default);
  }

  const defaults: Record<string, string> = {
    top: "100",
    skip: "0",
    offset: "0",
    limit: "50",
    direction: "both",
    depth: "1",
    max_depth: "10",
  };

  return defaults[parameter.name] ?? "";
}

export function buildEndpointUrl(
  apiOrigin: string,
  endpoint: ApiEndpoint,
  parameterValues: Record<string, string>,
) {
  const missingPathParameters: string[] = [];
  const path = endpoint.path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = parameterValues[name]?.trim();

    if (!value) {
      missingPathParameters.push(name);
      return `{${name}}`;
    }

    return encodeURIComponent(value);
  });

  if (missingPathParameters.length > 0) {
    throw new Error(`Set required path value: ${missingPathParameters.join(", ")}`);
  }

  const query = new URLSearchParams();
  endpoint.parameters
    .filter((parameter) => parameter.in === "query")
    .forEach((parameter) => {
      const value = parameterValues[parameter.name]?.trim();
      if (value) query.set(parameter.name, value);
    });

  const queryString = query.toString();
  return `${apiOrigin}${path}${queryString ? `?${queryString}` : ""}`;
}

export function tagSlug(tag: string) {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function methodTone(method: HttpMethod) {
  if (method === "get") return "border-sky-200 bg-sky-50 text-sky-800";
  if (method === "post") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (method === "delete") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export function formatBody(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
