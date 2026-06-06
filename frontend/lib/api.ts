import type {
  APITokenCreated,
  APITokenPublic,
  AuthStatus,
  AuthUser,
  ChartConfig,
  ChartSuggestion,
  ColumnInfo,
  GuardInfo,
  InfographicBrief,
  InvitePublic,
  KnowledgeNotebook,
  KnowledgeSource,
  Notebook,
  OAuthProviders,
  QueryResultPayload,
  RunQueryResponse,
  TrinoConnection,
} from "./types";

const API_BASE = "/api";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.detail) detail = String(parsed.detail);
    } catch {
      // text wasn't JSON; keep raw
    }
    throw new HttpError(res.status, detail || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => http<{ ok: boolean; version: string; ai_provider: string }>("/health"),

  // ----- Auth ------------------------------------------------------------
  authStatus: () => http<AuthStatus>("/auth/status"),
  me: () => http<AuthUser>("/auth/me"),
  login: (body: { email: string; password: string }) =>
    http<{ ok: boolean; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  register: (body: {
    email: string;
    name: string;
    password: string;
    invite_token?: string | null;
  }) =>
    http<{ ok: boolean; user: AuthUser; is_bootstrap: boolean }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(body) }
    ),
  logout: () => http<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  createInvite: (body: { email?: string | null; role?: "admin" | "member" }) =>
    http<InvitePublic>("/auth/invite", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listInvites: () => http<InvitePublic[]>("/auth/invites"),
  oauthProviders: () => http<OAuthProviders>("/auth/oauth/providers"),

  // ----- API tokens (personal access) ----------------------------------
  listApiTokens: () => http<APITokenPublic[]>("/me/tokens"),
  createApiToken: (body: { name: string; expires_in_days?: number | null }) =>
    http<APITokenCreated>("/me/tokens", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeApiToken: (id: string) =>
    http<{ ok: boolean }>(`/me/tokens/${id}`, { method: "DELETE" }),

  testConnection: (conn: TrinoConnection) =>
    http<{ ok: boolean; message: string; duration_seconds?: number }>("/connections/test", {
      method: "POST",
      body: JSON.stringify(conn),
    }),

  listCatalogs: (conn: TrinoConnection) =>
    http<{ catalogs: string[] }>("/metadata/catalogs", {
      method: "POST",
      body: JSON.stringify(conn),
    }),

  listSchemas: (conn: TrinoConnection, catalog: string) =>
    http<{ schemas: string[] }>(`/metadata/schemas?catalog=${encodeURIComponent(catalog)}`, {
      method: "POST",
      body: JSON.stringify(conn),
    }),

  listTables: (conn: TrinoConnection, catalog: string, schema: string) =>
    http<{ tables: Array<{ catalog: string; schema_name: string; name: string; table_type: string }> }>(
      `/metadata/tables?catalog=${encodeURIComponent(catalog)}&schema=${encodeURIComponent(schema)}`,
      { method: "POST", body: JSON.stringify(conn) }
    ),

  listColumns: (conn: TrinoConnection, catalog: string, schema: string, table: string) =>
    http<{ columns: ColumnInfo[] }>(
      `/metadata/columns?catalog=${encodeURIComponent(catalog)}&schema=${encodeURIComponent(
        schema
      )}&table=${encodeURIComponent(table)}`,
      { method: "POST", body: JSON.stringify(conn) }
    ),

  runQuery: (body: {
    connection: TrinoConnection;
    sql: string;
    limit?: number | null;
    confirm_write?: boolean;
  }) =>
    http<RunQueryResponse>("/query/run", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  explainQuery: (body: { connection: TrinoConnection; sql: string }) =>
    http<RunQueryResponse>("/query/explain", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  guard: (sql: string) =>
    http<GuardInfo>(`/query/guard?sql=${encodeURIComponent(sql)}`, { method: "POST" }),

  aiGenerateSQL: (body: { prompt: string; context: Record<string, unknown> }) =>
    http<{ sql: string; provider: string }>("/ai/generate-sql", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  aiExplainSQL: (body: { sql: string; context: Record<string, unknown> }) =>
    http<{ text: string; provider: string }>("/ai/explain-sql", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  aiOptimizeSQL: (body: { sql: string; context: Record<string, unknown> }) =>
    http<{ text: string; provider: string }>("/ai/optimize-sql", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  aiExplainResult: (body: {
    sql: string;
    columns: ColumnInfo[];
    sample_rows: Record<string, unknown>[];
    row_count: number;
    aggregated_stats: Record<string, unknown>;
  }) =>
    http<{ text: string; provider: string }>("/ai/explain-result", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  chartSuggest: (body: {
    columns: ColumnInfo[];
    sample_rows: Record<string, unknown>[];
    row_count: number;
  }) =>
    http<{ suggestion: ChartSuggestion }>("/charts/suggest", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  chartBuild: (body: {
    chart_config: ChartConfig;
    columns: ColumnInfo[];
    rows: Record<string, unknown>[];
    row_count: number;
    truncated: boolean;
  }) =>
    http<{ spec: Record<string, unknown> }>("/charts/build", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listKnowledgeNotebooks: () =>
    http<{ notebooks: KnowledgeNotebook[] }>("/knowledge/notebooks"),

  createKnowledgeNotebook: (body: { name: string; description?: string }) =>
    http<KnowledgeNotebook>("/knowledge/notebooks", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listKnowledgeSources: (notebookId: string) =>
    http<{ sources: KnowledgeSource[] }>(`/knowledge/notebooks/${notebookId}/sources`),

  knowledgeChat: (body: {
    notebook_id: string;
    question: string;
    source_ids?: string[];
  }) =>
    http<{ answer: string; provider: string; cited_source_ids: string[] }>(
      "/knowledge/chat",
      { method: "POST", body: JSON.stringify(body) }
    ),

  addKnowledgeSource: (body: {
    notebook_id: string;
    source_type: string;
    title: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }) =>
    http<KnowledgeSource>("/knowledge/sources", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  generateInfographic: (body: {
    notebook_id?: string | null;
    template: string;
    title_hint?: string | null;
    sql?: string | null;
    columns: ColumnInfo[];
    sample_rows: Record<string, unknown>[];
    aggregated_stats: Record<string, unknown>;
    notes?: string | null;
    persist?: boolean;
  }) =>
    http<{ brief: InfographicBrief; html: string; export_path?: string | null }>(
      "/infographics/generate",
      { method: "POST", body: JSON.stringify(body) }
    ),

  listInfographicTemplates: () =>
    http<{ templates: Array<{ id: string; title: string; description: string }> }>(
      "/infographics/templates"
    ),

  listNotebooks: () =>
    http<{ notebooks: Array<{ id: string; title: string; path: string }> }>("/notebooks"),

  createNotebook: (body: { title?: string }) =>
    http<{ notebook: Notebook }>("/notebooks", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getNotebook: (id: string) => http<{ notebook: Notebook }>(`/notebooks/${id}`),

  saveNotebook: (id: string, notebook: Notebook) =>
    http<{ ok: boolean; notebook_id: string; path: string }>(`/notebooks/${id}`, {
      method: "PUT",
      body: JSON.stringify(notebook),
    }),
};
