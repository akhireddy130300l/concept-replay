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

// Psychology-based spaced repetition intervals (in days)
const REVISION_INTERVALS = [1, 3, 7, 14, 30, 60];

async function generateTopicDescription(topic: string): Promise<string> {
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
            content: "You are a helpful learning assistant. Provide comprehensive, clear explanations of topics to help with learning and retention.",
          },
          {
            role: "user",
            content: `Provide a comprehensive explanation of: "${topic}". Include:
1. A clear definition and key concepts
2. How to answer questions about this topic
3. Practical applications and examples
4. Important points to remember

Keep it concise but informative (around 200-300 words).`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI API error:", response.status, await response.text());
      return "Review this topic and refresh your understanding.";
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Error generating description:", error);
    return "Review this topic and refresh your understanding.";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all topics due for revision today
    const today = new Date().toISOString().split("T")[0];
    const { data: dueTopics, error: fetchError } = await supabase
      .from("learned_topics")
      .select("*")
      .lte("next_revision_date", today);

    if (fetchError) {
      console.error("Error fetching topics:", fetchError);
      throw fetchError;
    }

    if (!dueTopics || dueTopics.length === 0) {
      return new Response(
        JSON.stringify({ message: "No topics due for revision today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group topics by user
    const topicsByUser = dueTopics.reduce((acc: any, topic: any) => {
      if (!acc[topic.user_id]) {
        acc[topic.user_id] = [];
      }
      acc[topic.user_id].push(topic);
      return acc;
    }, {});

    let emailsSent = 0;

    // Send emails to each user
    for (const [userId, topics] of Object.entries(topicsByUser)) {
      const topicsArray = topics as any[];

      // Get user email
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (userError || !userData?.user?.email) {
        console.error("Error fetching user:", userError);
        continue;
      }

      // Generate AI descriptions for all topics
      const topicsWithDescriptions = await Promise.all(
        topicsArray.map(async (topic) => ({
          ...topic,
          aiDescription: await generateTopicDescription(topic.title),
        }))
      );

      // Create email content
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0891b2;">🧠 Time to Review Your Topics!</h1>
          <p>Hello! Here are the topics due for revision today:</p>
          ${topicsWithDescriptions
            .map(
              (topic) => `
            <div style="background: #f0f9ff; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #0891b2;">
              <h2 style="color: #0891b2; margin-top: 0;">${topic.title}</h2>
              ${topic.description ? `<p style="color: #64748b; font-style: italic;">${topic.description}</p>` : ""}
              <div style="margin-top: 15px; line-height: 1.6;">
                ${topic.aiDescription}
              </div>
              <p style="color: #64748b; font-size: 12px; margin-top: 15px;">
                Originally learned: ${new Date(topic.learned_date).toLocaleDateString()}
              </p>
            </div>
          `
            )
            .join("")}
          <p style="color: #64748b; margin-top: 30px;">
            Keep up the great work! Regular reviews help solidify your knowledge.
          </p>
          <p style="color: #64748b;">
            Best regards,<br>
            LearnLoop Team
          </p>
        </div>
      `;

      // Send email
      const { error: emailError } = await resend.emails.send({
        from: "LearnLoop <onboarding@resend.dev>",
        to: [userData.user.email],
        subject: `📚 ${topicsArray.length} Topic${topicsArray.length > 1 ? "s" : ""} Due for Review`,
        html: emailContent,
      });

      if (emailError) {
        console.error("Error sending email:", emailError);
        continue;
      }

      emailsSent++;

      // Update next revision dates using psychology-based intervals
      for (const topic of topicsArray) {
        const currentCount = topic.revision_count || 0;
        const nextCount = currentCount + 1;
        const intervalIndex = Math.min(nextCount, REVISION_INTERVALS.length - 1);
        const daysUntilNext = REVISION_INTERVALS[intervalIndex];

        const nextRevisionDate = new Date();
        nextRevisionDate.setDate(nextRevisionDate.getDate() + daysUntilNext);

        await supabase
          .from("learned_topics")
          .update({
            next_revision_date: nextRevisionDate.toISOString(),
            revision_count: nextCount,
          })
          .eq("id", topic.id);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Successfully sent ${emailsSent} reminder email(s)`,
        topicsProcessed: dueTopics.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-revision-reminders:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
