export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  provider: "local" | "github" | "oidc";
  is_active: boolean;
  is_admin: boolean;
};

export type AuthStatus = {
  auth_enabled: boolean;
  allow_self_signup: boolean;
  is_bootstrap: boolean;
  authenticated: boolean;
  user: AuthUser | null;
};

export type InvitePublic = {
  token: string;
  email: string | null;
  role: "admin" | "member";
  expires_at: string;
  accepted_at: string | null;
};

export type APITokenPublic = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export type APITokenCreated = APITokenPublic & { plaintext: string };

export type OAuthProviders = { providers: string[] };

export type AIRuntimeConfig = {
  ai_provider: string | null;
  openai_api_key: string | null;
  openai_model: string | null;
  anthropic_api_key: string | null;
  anthropic_model: string | null;
  ollama_base_url: string | null;
  ollama_model: string | null;
  ai_context_mode: string | null;
  ai_allow_sample_rows: boolean | null;
  ai_sample_row_limit: number | null;
  ai_mask_pii: boolean | null;
  available_providers: string[];
};

export type SavedConnection = {
  id: string;
  name: string;
  connector_type: "trino" | "duckdb";
  host: string;
  catalog: string | null;
  schema_name: string | null;
  created_at: string;
  updated_at: string;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
};

export type AuditEvent = {
  ts: string;
  action: string;
  user_id: string | null;
  user_email: string | null;
  ok: boolean;
  target: string | null;
  ip: string | null;
  details: Record<string, unknown>;
};

export type TrinoConnection = {
  connector_type: "trino";
  connection_name: string;
  host: string;
  port: number;
  scheme: "https" | "http";
  user: string;
  password?: string;
  catalog?: string | null;
  schema?: string | null;
  verify_ssl?: boolean;
  ca_certificate_path?: string | null;
  query_timeout_seconds?: number;
  max_preview_rows?: number;
  max_result_rows?: number;
};

export type DuckDBConnection = {
  connector_type: "duckdb";
  connection_name: string;
  database: string; // ":memory:" or a file path
  read_only?: boolean;
  working_dir?: string | null;
  max_result_rows?: number;
};

/**
 * Shared shape for any SQLAlchemy-backed connector. The discriminator
 * field (`connector_type`) picks the dialect. Per-dialect extras (e.g.
 * Snowflake's `warehouse`, Databricks' `http_path`) are tacked on as
 * optional members in the variant types below.
 */
type SQLAlchemyBaseConnection = {
  connection_name: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  schema?: string | null;
  query_timeout_seconds?: number;
  max_result_rows?: number;
  connect_args?: Record<string, unknown>;
  url_params?: Record<string, string>;
};

export type PostgreSQLConnection = SQLAlchemyBaseConnection & {
  connector_type: "postgresql";
};
export type MySQLConnection = SQLAlchemyBaseConnection & {
  connector_type: "mysql";
};
export type MariaDBConnection = SQLAlchemyBaseConnection & {
  connector_type: "mariadb";
};
export type SQLiteConnection = SQLAlchemyBaseConnection & {
  connector_type: "sqlite";
};
export type MSSQLConnection = SQLAlchemyBaseConnection & {
  connector_type: "mssql";
  odbc_driver?: string;
};
export type SnowflakeConnection = SQLAlchemyBaseConnection & {
  connector_type: "snowflake";
  account?: string;
  warehouse?: string | null;
  role?: string | null;
};
export type BigQueryConnection = SQLAlchemyBaseConnection & {
  connector_type: "bigquery";
  project?: string;
  credentials_path?: string | null;
};
export type RedshiftConnection = SQLAlchemyBaseConnection & {
  connector_type: "redshift";
};
export type OracleConnection = SQLAlchemyBaseConnection & {
  connector_type: "oracle";
  service_name?: string | null;
};
export type ClickHouseConnection = SQLAlchemyBaseConnection & {
  connector_type: "clickhouse";
  secure?: boolean;
};
export type DatabricksConnection = SQLAlchemyBaseConnection & {
  connector_type: "databricks";
  http_path?: string;
  access_token?: string;
  catalog?: string | null;
};

/**
 * Union of every SQLAlchemy-backed connection variant. Useful as the type
 * the generic SQLAlchemy form works on.
 */
export type SQLAlchemyConnection =
  | PostgreSQLConnection
  | MySQLConnection
  | MariaDBConnection
  | SQLiteConnection
  | MSSQLConnection
  | SnowflakeConnection
  | BigQueryConnection
  | RedshiftConnection
  | OracleConnection
  | ClickHouseConnection
  | DatabricksConnection;

export type Connection =
  | TrinoConnection
  | DuckDBConnection
  | SQLAlchemyConnection;

export type ColumnInfo = {
  name: string;
  data_type: string;
  nullable?: boolean;
  comment?: string | null;
};

export type GuardVerdict = "allowed" | "warn" | "blocked";

export type GuardInfo = {
  verdict: GuardVerdict;
  reasons: string[];
  dangerous_keywords: string[];
  statement_type?: string | null;
};

export type QueryResultPayload = {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  row_count: number;
  duration_seconds: number;
  truncated: boolean;
  query_id?: string | null;
  sql?: string | null;
};

export type RunQueryResponse = {
  ok: boolean;
  guard: GuardInfo;
  result?: QueryResultPayload | null;
  error?: string | null;
};

export type ChartConfig = {
  chart_type: string;
  x?: string | null;
  y?: string | string[] | null;
  color?: string | null;
  aggregation?: string | null;
  title?: string | null;
  subtitle?: string | null;
  theme?: string;
  filters?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

export type ChartSuggestion = {
  chart_type: string;
  x?: string | null;
  y?: string | string[] | null;
  color?: string | null;
  aggregation?: string | null;
  title?: string | null;
  reason?: string | null;
};

export type CellType =
  | "markdown"
  | "sql"
  | "ai_prompt"
  | "visualization"
  | "knowledge_note";

export type MarkdownCell = {
  id: string;
  cell_type: "markdown";
  source: string;
  created_at?: string;
  updated_at?: string;
};

export type SQLCell = {
  id: string;
  cell_type: "sql";
  connection_name?: string | null;
  sql: string;
  limit?: number | null;
  chart_config?: ChartConfig | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
  suggested_sql?: string | null;
  provider?: string | null;
};

export type AIPromptCell = {
  id: string;
  cell_type: "ai_prompt";
  prompt: string;
  response?: string | null;
  suggested_sql?: string | null;
  context_mode?: string;
  messages?: AIChatMessage[];
  created_at?: string;
  updated_at?: string;
};

export type VisualizationCell = {
  id: string;
  cell_type: "visualization";
  source_cell_id?: string | null;
  chart_config: ChartConfig;
  created_at?: string;
  updated_at?: string;
};

export type KnowledgeNoteCell = {
  id: string;
  cell_type: "knowledge_note";
  title: string;
  body: string;
  knowledge_source_ids: string[];
  created_at?: string;
  updated_at?: string;
};

export type Cell =
  | MarkdownCell
  | SQLCell
  | AIPromptCell
  | VisualizationCell
  | KnowledgeNoteCell;

export type NotebookMetadata = {
  title: string;
  description?: string | null;
  tags: string[];
  author?: string | null;
  schema_version: number;
};

export type Notebook = {
  id: string;
  metadata: NotebookMetadata;
  cells: Cell[];
  created_at?: string;
  updated_at?: string;
};

export type KnowledgeSource = {
  id: string;
  notebook_id: string;
  source_type: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at?: string;
};

export type KnowledgeNotebook = {
  id: string;
  name: string;
  description?: string | null;
  provider_type: "internal" | "notebooklm_enterprise";
  created_at?: string;
  updated_at?: string;
};

export type InfographicBrief = {
  title: string;
  summary: string;
  key_metrics: Array<{ label: string; value: string | number }>;
  insights: string[];
  recommended_charts: ChartSuggestion[];
  layout: string;
  narrative: string;
  caveats: string[];
};
