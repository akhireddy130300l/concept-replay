// Persist the exact provider payload before delivery so retries use stable content and keys.
import { withinProviderRetryWindow } from "./automation-policy.ts";
export async function sendRecordedEmail(admin: any, input: {
  userId: string; kind: "stock" | "english" | "recap"; key: string; isTest?: boolean;
  from: string; to: string; subject: string; html: string; audioAvailable?: boolean; apiKey: string;
}) {
  const { data: prior, error: readError } = await admin.from("automation_email_deliveries")
    .select("status,subject,content_html,provider_id,audio_available,created_at").eq("delivery_key", input.key).maybeSingle();
  if (readError) throw new Error("Delivery history unavailable");
  if (prior?.status === "sent") return { ok: true, duplicate: true, id: prior.provider_id };
  // Provider keys expire after 24 hours; uncertain older deliveries need reconciliation, not blind resend.
  if (prior && !withinProviderRetryWindow(prior.created_at)) throw new Error("Older unconfirmed delivery needs review before retry");
  const subject = prior?.subject ?? input.subject;
  const html = prior?.content_html ?? input.html;
  if (!prior) {
    const { error } = await admin.from("automation_email_deliveries").insert({
      user_id: input.userId, kind: input.kind, delivery_key: input.key, is_test: Boolean(input.isTest),
      subject, content_html: html, audio_available: input.audioAvailable ?? null,
    });
    if (error) throw new Error("Cannot reserve delivery");
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}`, "Idempotency-Key": input.key },
      body: JSON.stringify({ from: input.from, to: [input.to], subject, html }),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id) throw new Error(`Email provider rejected delivery (${response.status})`);
    const { error } = await admin.from("automation_email_deliveries").update({ status: "sent", provider_id: result.id, sent_at: new Date().toISOString(), error_message: null }).eq("delivery_key", input.key);
    if (error) throw new Error("Delivery accepted; confirmation could not be saved");
    return { ok: true, duplicate: false, id: result.id };
  } catch (error) {
    await admin.from("automation_email_deliveries").update({ status: "failed", error_message: "Delivery requires retry" }).eq("delivery_key", input.key);
    throw error;
  }
}