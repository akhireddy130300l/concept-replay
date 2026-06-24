import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/lib/portfolio/schema";

const LABELS: Record<RequestStatus, string> = {
  pending: "Pending",
  running: "Processing",
  completed: "Completed",
  failed: "Failed",
  rate_limited: "Rate limited",
};

export function RequestStatusBadge({ status }: { status: RequestStatus | string }) {
  const label = LABELS[status as RequestStatus] ?? status;
  const variant =
    status === "completed" ? "default" :
    status === "failed" || status === "rate_limited" ? "destructive" :
    "secondary";
  return <Badge variant={variant as never}>{label}</Badge>;
}
