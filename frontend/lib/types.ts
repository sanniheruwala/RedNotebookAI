export type TrinoConnection = {
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

export type AIPromptCell = {
  id: string;
  cell_type: "ai_prompt";
  prompt: string;
  response?: string | null;
  suggested_sql?: string | null;
  context_mode?: string;
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
