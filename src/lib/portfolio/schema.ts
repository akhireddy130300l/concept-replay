import { z } from "zod";

export const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
export const MAX_HOLDINGS = 5;

export const HoldingInputSchema = z.object({
  ticker: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .refine((s) => TICKER_RE.test(s), { message: "Invalid ticker format" }),
  shares: z.number({ invalid_type_error: "Shares required" }).positive("Shares must be > 0").finite(),
  average_cost_unknown: z.boolean().optional(),
  average_cost: z
    .number({ invalid_type_error: "Average cost required" })
    .positive("Average cost must be > 0")
    .finite()
    .nullable(),
  purchase_date: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: "Invalid date" }),
});

export type HoldingInput = z.infer<typeof HoldingInputSchema>;

export const SubmitPayloadSchema = z.object({
  holdings: z.array(HoldingInputSchema).min(1).max(MAX_HOLDINGS),
  cash_balance: z.number().nonnegative().finite().nullable().optional(),
  account_total_declared: z.boolean().optional(),
  trigger_type: z.literal("web_form").optional(),
  save_holdings: z.boolean().optional(),
});

export type RequestStatus = "pending" | "running" | "completed" | "failed" | "rate_limited";
