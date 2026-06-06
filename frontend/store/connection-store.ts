import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Connection, DuckDBConnection, TrinoConnection } from "@/lib/types";

type ConnectionStore = {
  connection: Connection | null;
  setConnection: (c: Connection | null) => void;
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

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set) => ({
      connection: defaultConnection,
      selectedCatalog: null,
      selectedSchema: null,
      selectedTable: null,
      setConnection: (connection) => set({ connection }),
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
      version: 1,
      migrate: (persisted, _version) => {
        type LegacyState = { connection?: Partial<TrinoConnection> | null } & Record<
          string,
          unknown
        >;
        const state = persisted as LegacyState;
        if (
          state?.connection &&
          !state.connection.connector_type
        ) {
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
