import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { HoldingInputSchema, type HoldingInput, TICKER_RE } from "@/lib/portfolio/schema";

interface Props {
  initial?: Partial<HoldingInput> & { id?: string };
  onSubmit: (h: HoldingInput) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

export function HoldingForm({ initial, onSubmit, onCancel, submitLabel = "Add holding" }: Props) {
  const [ticker, setTicker] = useState(initial?.ticker ?? "");
  const [shares, setShares] = useState<string>(initial?.shares != null ? String(initial.shares) : "");
  const [avgCostUnknown, setAvgCostUnknown] = useState<boolean>(initial?.average_cost_unknown ?? false);
  const [avgCost, setAvgCost] = useState<string>(initial?.average_cost != null ? String(initial.average_cost) : "");
  const [purchaseDate, setPurchaseDate] = useState<string>(initial?.purchase_date ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (avgCostUnknown) setAvgCost("");
  }, [avgCostUnknown]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const candidate = {
      ticker: ticker.trim().toUpperCase(),
      shares: Number(shares),
      average_cost_unknown: avgCostUnknown,
      average_cost: avgCostUnknown ? null : Number(avgCost),
      purchase_date: purchaseDate || null,
    };
    const parsed = HoldingInputSchema.safeParse(candidate);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!map[key]) map[key] = issue.message;
      }
      setErrors(map);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="ticker">Ticker</Label>
        <Input
          id="ticker"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="ARM"
          maxLength={10}
          autoCapitalize="characters"
          required
        />
        {errors.ticker && <p className="text-xs text-destructive">{errors.ticker}</p>}
        {ticker && !TICKER_RE.test(ticker) && !errors.ticker && (
          <p className="text-xs text-muted-foreground">Letters, digits, dot or hyphen.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="shares">Shares</Label>
          <Input
            id="shares"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            required
          />
          {errors.shares && <p className="text-xs text-destructive">{errors.shares}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="avg-cost">Average cost</Label>
          <Input
            id="avg-cost"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            value={avgCost}
            disabled={avgCostUnknown}
            onChange={(e) => setAvgCost(e.target.value)}
            placeholder={avgCostUnknown ? "Unknown" : ""}
          />
          {errors.average_cost && !avgCostUnknown && (
            <p className="text-xs text-destructive">{errors.average_cost}</p>
          )}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox checked={avgCostUnknown} onCheckedChange={(c) => setAvgCostUnknown(Boolean(c))} />
        Average cost unknown
      </label>
      <div className="space-y-1">
        <Label htmlFor="purchase-date">Purchase date (optional)</Label>
        <Input
          id="purchase-date"
          type="date"
          value={purchaseDate}
          onChange={(e) => setPurchaseDate(e.target.value)}
        />
        {errors.purchase_date && <p className="text-xs text-destructive">{errors.purchase_date}</p>}
      </div>
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
