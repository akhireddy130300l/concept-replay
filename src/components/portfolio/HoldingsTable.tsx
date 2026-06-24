import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import type { HoldingInput } from "@/lib/portfolio/schema";

export interface HoldingRow extends HoldingInput {
  id?: string;
  saved?: boolean;
}

interface Props {
  rows: HoldingRow[];
  onEdit?: (idx: number) => void;
  onRemove?: (idx: number) => void;
  showSavedBadge?: boolean;
}

export function HoldingsTable({ rows, onEdit, onRemove, showSavedBadge = false }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No holdings yet.</p>;
  }
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-2 font-medium">Ticker</th>
            <th className="text-right p-2 font-medium">Shares</th>
            <th className="text-right p-2 font-medium">Avg cost</th>
            <th className="text-left p-2 font-medium hidden sm:table-cell">Date</th>
            {showSavedBadge && <th className="text-center p-2 font-medium">Source</th>}
            {(onEdit || onRemove) && <th className="p-2"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? `${r.ticker}-${i}`} className="border-t">
              <td className="p-2 font-medium">{r.ticker}</td>
              <td className="p-2 text-right">{r.shares}</td>
              <td className="p-2 text-right">
                {r.average_cost_unknown || r.average_cost == null ? (
                  <span className="text-muted-foreground italic">unknown</span>
                ) : (
                  r.average_cost.toFixed(2)
                )}
              </td>
              <td className="p-2 hidden sm:table-cell text-muted-foreground">{r.purchase_date ?? "—"}</td>
              {showSavedBadge && (
                <td className="p-2 text-center text-xs">
                  {r.saved ? (
                    <span className="text-primary">saved</span>
                  ) : (
                    <span className="text-muted-foreground">one-time</span>
                  )}
                </td>
              )}
              {(onEdit || onRemove) && (
                <td className="p-2 text-right whitespace-nowrap">
                  {onEdit && (
                    <Button type="button" size="icon" variant="ghost" onClick={() => onEdit(i)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {onRemove && (
                    <Button type="button" size="icon" variant="ghost" onClick={() => onRemove(i)} aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
