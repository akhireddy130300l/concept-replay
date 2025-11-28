import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REVISION_INTERVALS = [1, 3, 7, 14, 30, 60];

async function generateTopicDescription(topic: string): Promise<string> {
  console.log("Generating AI description for topic:", topic);
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `
You are an AI that must output ONLY valid HTML. 
Never use Markdown. Never use **bold**, ##, *, -, backticks, or code fences.
Your output must be 100% HTML with tags like <h2>, <p>, <ul>, <li>, <strong>, <a>.
If the user asks anything, ALWAYS respond in pure HTML.
            `,
          },
          {
            role: "user",
            content: `Provide the explanation of topic "${topic}" ONLY in pure HTML.
STRICT RULES:
- Do NOT use Markdown.
- Do NOT use **bold**, ## headings, *, -, or backticks.
- Use only HTML tags like <h2>, <ul>, <li>, <p>, <strong>.
- Structure sections as:
  <h2>Definition and Key Concepts</h2>
  <ul><li>...</li></ul>

  <h2>How to Answer Questions About This Topic</h2>
  <ul><li>...</li></ul>

  <h2>Common Interview Questions (with short answers)</h2>
  <ul><li><strong>Q:</strong> ... <strong>A:</strong> ...</li></ul>

  <h2>Practical Applications</h2>
  <ul><li>...</li></ul>

  <h2>Important Points to Remember</h2>
  <ul><li>...</li></ul>

  <h2>Useful YouTube Videos</h2>
  <ul><li><a href="LINK">Video Title</a></li></ul>

Return ONLY HTML.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI API error:", response.status, await response.text());
      return "Review this topic and refresh your understanding.";
    }

    const data = await response.json();
    console.log("AI description generated successfully for topic:", topic);
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Error generating description:", error);
    return "Review this topic and refresh your understanding.";
  }
}

serve(async (req) => {
  console.log("Request received at:", new Date().toISOString());

  if (req.method === "OPTIONS") {
    console.log("OPTIONS request — returning CORS headers");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Initializing Supabase client...");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Only fetch topics where revision time has actually passed (not future times today)
    const now = new Date();
    const currentTime = now.toISOString();
    console.log("Fetching topics due for revision up to:", currentTime);
    const { data: dueTopics, error: fetchError } = await supabase
      .from("learned_topics")
      .select("*")
      .lte("next_revision_date", currentTime);

    if (fetchError) {
      console.error("Error fetching topics:", fetchError);
      throw fetchError;
    }

    console.log("Topics fetched:", dueTopics?.length || 0);

    if (!dueTopics || dueTopics.length === 0) {
      console.log("No topics due today. Exiting.");
      return new Response(
        JSON.stringify({ message: "No topics due for revision today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const topicsByUser = dueTopics.reduce((acc: any, topic: any) => {
      if (!acc[topic.user_id]) acc[topic.user_id] = [];
      acc[topic.user_id].push(topic);
      return acc;
    }, {});

    console.log("Topics grouped by user:", Object.keys(topicsByUser));

    let emailsSent = 0;

    for (const [userId, topics] of Object.entries(topicsByUser)) {
      const topicsArray = topics as any[];
      console.log("Processing user:", userId, "with", topicsArray.length, "topics");

      console.log("Fetching user email from Supabase...");
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (userError || !userData?.user?.email) {
        console.error("Error fetching user:", userError);
        continue;
      }
      const userEmail = userData.user.email;
      console.log("User email:", userEmail);

      const topicsWithDescriptions = await Promise.all(
        topicsArray.map(async (topic) => {
          const desc = await generateTopicDescription(topic.title);
          console.log("Generated description for topic:", topic.title);
          return { ...topic, aiDescription: desc };
        })
      );

      const emailContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
          <h1 style="color: #0891b2; font-size: 28px; margin-bottom: 10px; font-weight: 600;">🧠 Time to Review Your Topics!</h1>
          <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">Hello! Here are the topics due for revision today:</p>
          ${topicsWithDescriptions
            .map(
              (topic) => `
            <div style="background: #f8fafc; padding: 24px; margin: 24px 0; border-radius: 12px; border-left: 4px solid #0891b2; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h2 style="color: #0f172a; font-size: 22px; margin: 0 0 12px 0; font-weight: 600;">${topic.title}</h2>
              ${topic.description ? `<p style="color: #64748b; font-style: italic; font-size: 14px; margin-bottom: 16px; padding: 10px; background: #e0f2fe; border-radius: 6px;">${topic.description}</p>` : ""}
              <div style="margin-top: 20px; line-height: 1.8; color: #334155; font-size: 15px;">
                <style>
                  h2 { color: #0891b2 !important; font-size: 18px !important; margin: 20px 0 10px 0 !important; font-weight: 600 !important; }
                  h3 { color: #0f172a !important; font-size: 16px !important; margin: 16px 0 8px 0 !important; font-weight: 600 !important; }
                  ul { margin: 12px 0 !important; padding-left: 24px !important; }
                  li { margin: 8px 0 !important; line-height: 1.6 !important; }
                  p { margin: 12px 0 !important; line-height: 1.6 !important; }
                  strong { color: #0f172a !important; font-weight: 600 !important; }
                  a { color: #0891b2 !important; text-decoration: none !important; }
                </style>
                ${topic.aiDescription}
              </div>
              <p style="color: #94a3b8; font-size: 13px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e2e8f0;">📅 Originally learned: ${new Date(topic.learned_date).toLocaleDateString()}</p>
            </div>
          `
            )
            .join("")}
          <p style="color: #64748b; margin-top: 40px; font-size: 15px; line-height: 1.6;">Keep up the great work! Regular reviews help solidify your knowledge. 💪</p>
          <p style="color: #94a3b8; font-size: 14px; margin-top: 20px;">Best regards,<br><strong style="color: #0891b2;">LearnLoop Team</strong></p>
        </div>
      `;

      const fromEmail = "onboarding@resend.dev";
      // Send to actual user email (requires verified domain for production)
      const toEmail = userEmail;

      console.log("Sending email with:");
      console.log("FROM:", fromEmail);
      console.log("TO:", toEmail);
      console.log("SUBJECT:", `📚 ${topicsArray.length} Topic${topicsArray.length > 1 ? "s" : ""} Due for Review`);

      try {
        const result = await resend.emails.send({
          from: fromEmail,
          to: [toEmail],
          subject: `📚 ${topicsArray.length} Topic${topicsArray.length > 1 ? "s" : ""} Due for Review`,
          html: emailContent,
        });
        console.log("Resend API response:", result);

        if (result.data?.id) {
          emailsSent++;
          console.log("Email sent successfully to:", toEmail);
        } else {
          console.error("Email not sent, response:", result.error);
        }
      } catch (err) {
        console.error("Resend send failed:", err);
      }

      console.log("Updating next revision dates for topics...");
      for (const topic of topicsArray) {
        const currentCount = topic.revision_count || 0;
        const nextCount = currentCount + 1;
        const intervalIndex = Math.min(nextCount, REVISION_INTERVALS.length - 1);
        const daysUntilNext = REVISION_INTERVALS[intervalIndex];

        const nextRevisionDate = new Date();
        nextRevisionDate.setDate(nextRevisionDate.getDate() + daysUntilNext);

        console.log(`Updating topic ${topic.id} next_revision_date to ${nextRevisionDate.toISOString()}`);
        await supabase
          .from("learned_topics")
          .update({
            next_revision_date: nextRevisionDate.toISOString(),
            revision_count: nextCount,
          })
          .eq("id", topic.id);
      }
    }

    console.log(`All users processed. Emails sent: ${emailsSent}`);
    return new Response(
      JSON.stringify({ message: `Successfully sent ${emailsSent} reminder email(s)`, topicsProcessed: dueTopics.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-revision-reminders:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
