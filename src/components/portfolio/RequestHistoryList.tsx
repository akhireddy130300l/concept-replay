import { RequestStatusBadge } from "./RequestStatusBadge";

export interface RequestHistoryRow {
  id: string;
  created_at: string;
  holdings_count: number;
  status: string;
  final_decision_status: string | null;
  confidence: string | null;
  email_sent: boolean | null;
  error_summary: string | null;
}

export function RequestHistoryList({ rows }: { rows: RequestHistoryRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No previous requests.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-muted-foreground text-xs">
              {new Date(r.created_at).toLocaleString()}
            </span>
            <RequestStatusBadge status={r.status} />
          </div>
          <div className="text-xs text-muted-foreground">
            {r.holdings_count} holding{r.holdings_count === 1 ? "" : "s"}
            {r.final_decision_status && <> · Decision: <b className="text-foreground">{r.final_decision_status}</b></>}
            {r.confidence && <> · Confidence: {r.confidence}</>}
            {r.email_sent !== null && <> · Email: {r.email_sent ? "sent" : "not sent"}</>}
          </div>
          {r.status === "failed" && r.error_summary && (
            <div className="text-xs text-destructive mt-1">Reason: {r.error_summary}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
