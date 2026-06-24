import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  cashBalance: number | null;
  setCashBalance: (v: number | null) => void;
  accountTotalDeclared: boolean;
  setAccountTotalDeclared: (v: boolean) => void;
}

export function CashBalanceInput({ cashBalance, setCashBalance, accountTotalDeclared, setAccountTotalDeclared }: Props) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-2">
        <Label htmlFor="cash-balance">Cash balance (optional)</Label>
        <Input
          id="cash-balance"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="0.00"
          value={cashBalance === null ? "" : cashBalance}
          onChange={(e) => {
            const v = e.target.value;
            setCashBalance(v === "" ? null : Math.max(0, Number(v)));
          }}
        />
      </div>
      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={accountTotalDeclared}
          onCheckedChange={(c) => setAccountTotalDeclared(Boolean(c))}
          className="mt-1"
        />
        <span className="text-sm">
          These holdings and cash represent my full account.
          {accountTotalDeclared && cashBalance === null && (
            <span className="block text-xs text-destructive mt-1">
              Cash balance required when declaring full account (enter 0 if none).
            </span>
          )}
        </span>
      </label>
      <p className="text-xs text-muted-foreground">
        {accountTotalDeclared
          ? "Concentration will be calculated against your declared account total (holdings + cash)."
          : "Weights will be calculated only among the holdings submitted in this request. Accurate account concentration requires entering all active holdings and cash."}
      </p>
    </div>
  );
}
