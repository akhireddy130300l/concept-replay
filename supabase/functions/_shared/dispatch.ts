// Internal edge-to-edge dispatch helper. Never logs or sends the service-role key.

export async function dispatchProcessRequest(
  supabaseUrl: string,
  internalDispatchSecret: string,
  requestId: string,
): Promise<void> {
  const url = `${supabaseUrl}/functions/v1/process-portfolio-research`;
  // Fire-and-forget. Errors are swallowed; the submit response has already been
  // returned. Recovery is the caller's responsibility (not in Phase 2).
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-dispatch": internalDispatchSecret,
      },
      body: JSON.stringify({ request_id: requestId }),
    });
  } catch {
    // Intentionally swallow — Phase 2 has no sweeper yet.
  }
}
