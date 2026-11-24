import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runSwingTraderWatch } from "../_shared/swing-watch.ts";

Deno.test("stock test preview cannot persist a live run or write training data", async () => {
  const writes: string[] = [];
  const query = (table: string): any => new Proxy({}, {
    get: (_target, key) => {
      if (key === "then") return (resolve: (value: unknown) => void) => resolve({ data: [], count: 0, error: null });
      if (key === "maybeSingle") return async () => ({ data: table === "swing_ticker_cache" ? { payload: {} } : null, error: null });
      return () => {
        if (["insert", "update", "upsert", "delete"].includes(String(key))) writes.push(`${table}:${String(key)}`);
        return query(table);
      };
    },
  });
  const admin = { from: (table: string) => query(table) } as any;
  const inputs = [{ ticker: "TEST", company: "Test Company", price: 20, oneDayPct: 1, sourceTables: ["test"] }];
  const oldKey = Deno.env.get("EXA_API_KEY");
  const oldFetch = globalThis.fetch;
  Deno.env.set("EXA_API_KEY", "unit-test");
  globalThis.fetch = () => Promise.reject(new Error("No network in unit tests"));
  try {
    const result = await runSwingTraderWatch(admin, inputs, undefined, undefined, { preview: true });
    assertEquals(writes, []);
    assertEquals(result.runId, undefined);
    assertEquals(result.mlStats?.savedThisRun, 0);
    await runSwingTraderWatch(admin, inputs);
    assertEquals(writes.includes("swing_trade_runs:insert"), true);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) Deno.env.delete("EXA_API_KEY"); else Deno.env.set("EXA_API_KEY", oldKey);
  }
});