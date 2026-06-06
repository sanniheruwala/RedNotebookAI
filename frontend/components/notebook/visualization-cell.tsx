"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, BarChart3, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ChartBuilder } from "@/components/notebook/chart-builder";
import { ChartView } from "@/components/notebook/chart-view";
import {
  useActiveCellResult,
  useActiveNotebook,
  useNotebookStore,
} from "@/store/notebook-store";
import type { ChartConfig, VisualizationCell as VisualizationCellType } from "@/lib/types";

/**
 * A standalone chart cell. Picks any SQL cell in the same notebook as its
 * data source, then renders + configures a chart against that cell's
 * latest result. Avoids duplicating data: re-uses whatever the source SQL
 * cell already fetched.
 */
export function VisualizationCell({ cell }: { cell: VisualizationCellType }) {
  const notebook = useActiveNotebook();
  const updateCell = useNotebookStore((s) => s.updateCell);
  const removeCell = useNotebookStore((s) => s.removeCell);
  const duplicateCell = useNotebookStore((s) => s.duplicateCell);
  const moveCell = useNotebookStore((s) => s.moveCell);

  const sqlCells = React.useMemo(
    () =>
      notebook.cells
        .filter((c) => c.cell_type === "sql")
        .map((c) => ({
          id: c.id,
          label:
            (c.cell_type === "sql" && c.sql.trim().split("\n")[0].slice(0, 60)) ||
            "Untitled SQL",
        })),
    [notebook.cells]
  );

  // Default to the first SQL cell when none chosen yet.
  React.useEffect(() => {
    if (!cell.source_cell_id && sqlCells.length > 0) {
      updateCell(cell.id, (c) =>
        c.cell_type === "visualization"
          ? { ...c, source_cell_id: sqlCells[0].id }
          : c
      );
    }
  }, [cell.id, cell.source_cell_id, sqlCells, updateCell]);

  const sourceResult = useActiveCellResult(cell.source_cell_id ?? "");

  const onChangeConfig = (next: ChartConfig) =>
    updateCell(cell.id, (c) =>
      c.cell_type === "visualization" ? { ...c, chart_config: next } : c
    );

  const onChangeSource = (id: string) =>
    updateCell(cell.id, (c) =>
      c.cell_type === "visualization" ? { ...c, source_cell_id: id || null } : c
    );

  const result = sourceResult?.result ?? null;
  const hasSource = !!cell.source_cell_id;

  return (
    <div className="card-premium group/cell relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-[3px] bg-primary/40" />

      <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs">
          <Badge
            variant="secondary"
            className="h-5 gap-1 rounded-md px-1.5 text-[10px] font-semibold uppercase tracking-wider"
          >
            <BarChart3 className="h-2.5 w-2.5" />
            Chart
          </Badge>
          {result && (
            <span className="text-muted-foreground">
              {result.row_count} rows from source
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/cell:opacity-100">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => moveCell(cell.id, "up")}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => moveCell(cell.id, "down")}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => duplicateCell(cell.id)}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => removeCell(cell.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Source SQL cell
          </Label>
          <Select
            value={cell.source_cell_id ?? ""}
            onChange={(e) => onChangeSource(e.target.value)}
            disabled={sqlCells.length === 0}
          >
            {sqlCells.length === 0 && <option value="">No SQL cells yet</option>}
            {sqlCells.length > 0 && cell.source_cell_id === null && (
              <option value="">Pick a SQL cell</option>
            )}
            {sqlCells.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label || "Untitled SQL"}
              </option>
            ))}
          </Select>
        </div>

        {!hasSource ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Add a SQL cell above and run it, then pick it as the source for this chart.
          </div>
        ) : !result ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Run the source SQL cell first to populate this chart.
          </div>
        ) : (
          <>
            <ChartBuilder
              result={result}
              config={cell.chart_config}
              onChange={onChangeConfig}
            />
            <ChartView result={result} config={cell.chart_config} />
          </>
        )}
      </div>
    </div>
  );
}
