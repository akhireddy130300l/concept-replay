import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { HoldingRow } from "./HoldingsTable";

interface Props {
  holdings: HoldingRow[];
  saveHoldings: boolean;
  cashBalance: number | null;
  accountTotalDeclared: boolean;
  recipientEmail: string;
  onConfirm: () => void;
  disabled?: boolean;
  busy?: boolean;
}

export function ResearchConfirmButton({
  holdings,
  saveHoldings,
  cashBalance,
  accountTotalDeclared,
  recipientEmail,
  onConfirm,
  disabled,
  busy,
}: Props) {
  const [open, setOpen] = useState(false);
  const canSubmit = !disabled && !busy && holdings.length > 0 && holdings.length <= 5;
  const basis = accountTotalDeclared ? "account_total" : "submitted_only";
  return (
    <>
      <Button
        type="button"
        size="lg"
        onClick={() => setOpen(true)}
        disabled={!canSubmit}
        className="w-full"
      >
        {busy ? "Working…" : "Research My Portfolio"}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm research request</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-foreground">
                <div><b>{holdings.length}</b> holding{holdings.length === 1 ? "" : "s"}: {holdings.map((h) => h.ticker).join(", ")}</div>
                <div>Source: {saveHoldings ? "Saved for future research" : "One-time analysis only"}</div>
                <div>Cash: {cashBalance === null ? "not provided" : `$${cashBalance.toFixed(2)}`}</div>
                <div>Concentration basis: <code>{basis}</code></div>
                <div className="pt-1 text-muted-foreground">Private report will be emailed to: <b className="text-foreground">{recipientEmail}</b></div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              Submit request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
