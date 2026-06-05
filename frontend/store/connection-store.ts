import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TrinoConnection } from "@/lib/types";

type ConnectionStore = {
  connection: TrinoConnection | null;
  setConnection: (c: TrinoConnection | null) => void;
  selectedCatalog: string | null;
  selectedSchema: string | null;
  selectedTable: string | null;
  setSelected: (c: { catalog?: string | null; schema?: string | null; table?: string | null }) => void;
};

const defaultConnection: TrinoConnection = {
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
    { name: "rednotebook-connection" }
  )
);
