import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Connection,
  DuckDBConnection,
  SQLAlchemyConnection,
  TrinoConnection,
} from "@/lib/types";
import type { ConnectorId } from "@/lib/connectors";

type ConnectionStore = {
  connection: Connection | null;
  /** Server-side id of the active saved connection, when one is loaded. */
  activeConnectionId: string | null;
  setConnection: (c: Connection | null) => void;
  setActiveConnectionId: (id: string | null) => void;
  selectedCatalog: string | null;
  selectedSchema: string | null;
  selectedTable: string | null;
  setSelected: (c: {
    catalog?: string | null;
    schema?: string | null;
    table?: string | null;
  }) => void;
};

export const defaultTrinoConnection: TrinoConnection = {
  connector_type: "trino",
  connection_name: "default",
  host: "",
  port: 443,
  scheme: "https",
  user: "",
  password: "",
  catalog: "",
  schema: "",
  verify_ssl: true,
  query_timeout_seconds: 300,
  max_preview_rows: 100,
  max_result_rows: 10000,
};

export const defaultDuckDBConnection: DuckDBConnection = {
  connector_type: "duckdb",
  connection_name: "local",
  database: ":memory:",
  read_only: false,
  working_dir: null,
  max_result_rows: 10000,
};

// Friendlier default: DuckDB in-memory works with zero setup, so new users
// can start querying immediately (CREATE TABLE / read_csv_auto / etc).
const defaultConnection: Connection = defaultDuckDBConnection;

/**
 * Default config for any SQLAlchemy-backed connector. Picks the right
 * default port and dialect-specific extras (e.g. Snowflake's account).
 */
export function defaultForConnector(id: ConnectorId): Connection {
  if (id === "duckdb") return defaultDuckDBConnection;
  if (id === "trino") return defaultTrinoConnection;
  const base = {
    connection_name: id,
    host: "",
    database: "",
    username: "",
    password: "",
    max_result_rows: 10_000,
  } as const;
  switch (id) {
    case "postgresql":
      return { ...base, connector_type: "postgresql", port: 5432, database: "postgres" };
    case "mysql":
      return { ...base, connector_type: "mysql", port: 3306 };
    case "mariadb":
      return { ...base, connector_type: "mariadb", port: 3306 };
    case "sqlite":
      return { ...base, connector_type: "sqlite", database: ":memory:" };
    case "mssql":
      return {
        ...base,
        connector_type: "mssql",
        port: 1433,
        odbc_driver: "ODBC Driver 18 for SQL Server",
      };
    case "snowflake":
      return {
        ...base,
        connector_type: "snowflake",
        account: "",
        warehouse: null,
        role: null,
      };
    case "bigquery":
      return {
        ...base,
        connector_type: "bigquery",
        project: "",
        credentials_path: null,
      };
    case "redshift":
      return { ...base, connector_type: "redshift", port: 5439 };
    case "oracle":
      return {
        ...base,
        connector_type: "oracle",
        port: 1521,
        service_name: null,
      };
    case "clickhouse":
      return {
        ...base,
        connector_type: "clickhouse",
        port: 8123,
        secure: false,
      };
    case "databricks":
      return {
        ...base,
        connector_type: "databricks",
        http_path: "",
        access_token: "",
        catalog: null,
      };
  }
}

/** Re-export so connection-dialog can be more explicit about the form union. */
export type { SQLAlchemyConnection };

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set) => ({
      connection: defaultConnection,
      activeConnectionId: null,
      selectedCatalog: null,
      selectedSchema: null,
      selectedTable: null,
      setConnection: (connection) => set({ connection }),
      setActiveConnectionId: (id) => set({ activeConnectionId: id }),
      setSelected: ({ catalog, schema, table }) =>
        set((state) => ({
          selectedCatalog: catalog ?? state.selectedCatalog,
          selectedSchema: schema ?? state.selectedSchema,
          selectedTable: table ?? state.selectedTable,
        })),
    }),
    {
      name: "rednotebook-connection",
      // Migrate from the v0 shape (Trino-only, no connector_type field).
      version: 2,
      migrate: (persisted, _version) => {
        type LegacyState = {
          connection?: Partial<TrinoConnection> | null;
        } & Record<string, unknown>;
        const state = persisted as LegacyState;
        if (state?.connection && !state.connection.connector_type) {
          state.connection = {
            ...defaultTrinoConnection,
            ...state.connection,
            connector_type: "trino",
          };
        }
        return state as unknown as ConnectionStore;
      },
    }
  )
);
