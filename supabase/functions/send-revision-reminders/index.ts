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

function getTimezoneOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return asUTC - date.getTime();
}

function zonedTimeToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min, 0);
  const offset = getTimezoneOffsetMs(new Date(guess), tz);
  return new Date(guess - offset);
}

function nextRevisionInstant(now: Date, daysFromNow: number, hour: number, minute: number, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const cal = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  cal.setUTCDate(cal.getUTCDate() + daysFromNow);
  let instant = zonedTimeToUtc(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate(), hour, minute, tz);
  if (instant.getTime() <= now.getTime()) {
    cal.setUTCDate(cal.getUTCDate() + 1);
    instant = zonedTimeToUtc(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate(), hour, minute, tz);
  }
  return instant;
}

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
            content: `You are given a topic: "${topic}".

First, CLASSIFY the topic into ONE of these three buckets, then respond using ONLY that bucket's format. Do NOT mix formats.

============================================================
BUCKET A — Prompt / Instruction / Task / Spec
(The topic reads like an instruction, a request, a system prompt,
a feature spec, a "build/make/create/design/write X" task, or a
question phrased as a request. Examples: "You are a real-time
stock market data agent...", "Write a function that...", "Design a
schema for...", "Explain X in simple terms", "How do I deploy...".)

If BUCKET A: respond NATURALLY and DIRECTLY to the request itself.
Do NOT generate "Definition / Interview / Practical Applications /
Common Interview Questions / Important Points". Just answer or
fulfill the task like a normal helpful assistant would, in clean HTML.
Use sensible sections only if they help the answer.

Structure (flexible — only what fits):
<h2>Answer</h2>
<p>...</p>
<h2>Details</h2>
<ul><li>...</li></ul>
<h2>Example</h2>
<p>...</p>

============================================================
BUCKET B — Technical / Study / Course concept
(A noun-like concept the user wants to learn or revise. Examples:
Java, Spring Boot, Hibernate, Machine Learning, Networking, OOP,
Kubernetes, REST API.)

If BUCKET B: use the interview-prep structure.
<h2>Definition and Key Concepts</h2><ul><li>...</li></ul>
<h2>Brief overview</h2><ul><li>...</li></ul>
<h2>Explain this in an interview</h2><ul><li>...</li></ul>
<h2>Practical Applications</h2><ul><li>...</li></ul>
<h2>Common Interview Questions and with short answers</h2>
<ul><li><strong>Q:</strong> ... <strong>A:</strong> ...</li></ul>
<h2>Important Points to Remember</h2><ul><li>...</li></ul>

============================================================
BUCKET C — Communication / Language / Daily-usage
(English speaking, fluency, slang, idioms, phrases, conversation.)

If BUCKET C: use the practical-sentences structure.
<h2>Quick Meaning</h2><p>One line explanation of "${topic}"</p>
<h2>Sentences to Practice</h2>
<ul>
<li>Sentence 1 - <em>Context/When to use</em></li>
<li>Sentence 2 - <em>Context/When to use</em></li>
<li>Sentence 3 - <em>Context/When to use</em></li>
<li>Sentence 4 - <em>Context/When to use</em></li>
<li>Sentence 5 - <em>Context/When to use</em></li>
</ul>
<h2>Common Conversations</h2>
<p>A short dialogue example using "${topic}":</p>
<ul>
<li><strong>A:</strong> ...</li>
<li><strong>B:</strong> ...</li>
</ul>
<h2>Similar Expressions</h2>
<ul><li>Alternative ways to say the same thing</li></ul>
<h2>Mistakes to Avoid</h2>
<ul><li>Common errors learners make with this</li></ul>

============================================================
STRICT OUTPUT RULES (all buckets):
- Output ONLY pure HTML. No Markdown, no **bold**, no ##, no -, no backticks, no code fences.
- Use only tags like <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <a>, <pre>, <code>.
- Pick exactly ONE bucket. Never combine buckets.
- If the topic is clearly a prompt/instruction (Bucket A), you MUST NOT output the interview structure.`,
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

interface MCQ {
  question: string;
  options: string[];
  correctAnswer: string;
}

async function generateMCQ(topic: string): Promise<MCQ | null> {
  console.log("Generating MCQ for topic:", topic);
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
            content: "You generate quiz questions. Return ONLY valid JSON, no markdown, no code fences.",
          },
          {
            role: "user",
            content: `Generate a multiple choice question about "${topic}". Return JSON with this exact structure:
{"question":"Your question here?","options":["A) option1","B) option2","C) option3","D) option4"],"correctAnswer":"A) option1"}
The correct answer must exactly match one of the options. Make the question test understanding, not just memorization.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("MCQ generation failed:", response.status);
      return null;
    }

    const data = await response.json();
    let content = data.choices[0].message.content.trim();
    // Strip markdown code fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const mcq = JSON.parse(content);
    console.log("MCQ generated for topic:", topic);
    return mcq;
  } catch (error) {
    console.error("Error generating MCQ:", error);
    return null;
  }
}

function buildQuizHTML(mcq: MCQ, userId: string, topicId: string, quizBaseUrl: string): string {
  const encodedQuestion = encodeURIComponent(mcq.question);
  const encodedCorrect = encodeURIComponent(mcq.correctAnswer);

  const optionsHTML = mcq.options
    .map((opt) => {
      const encodedOpt = encodeURIComponent(opt);
      const answerUrl = `${quizBaseUrl}?user_id=${userId}&topic_id=${topicId}&question=${encodedQuestion}&selected=${encodedOpt}&correct=${encodedCorrect}`;
      return `<a href="${answerUrl}" style="display: block; padding: 14px 20px; margin: 8px 0; background: #f0f9ff; border: 2px solid #bae6fd; border-radius: 10px; text-decoration: none; color: #0c4a6e; font-size: 15px; font-weight: 500; transition: all 0.2s;">${opt}</a>`;
    })
    .join("");

  return `
    <div style="background: linear-gradient(135deg, #eff6ff, #f0f9ff); padding: 28px; margin: 30px 0; border-radius: 16px; border: 2px solid #93c5fd;">
      <div style="display: flex; align-items: center; margin-bottom: 16px;">
        <span style="font-size: 28px; margin-right: 10px;">🎯</span>
        <h3 style="color: #1e40af; font-size: 18px; margin: 0; font-weight: 700;">Quick Quiz — Test Your Knowledge!</h3>
      </div>
      <p style="color: #1e3a5f; font-size: 16px; font-weight: 600; margin-bottom: 16px; line-height: 1.5;">${mcq.question}</p>
      ${optionsHTML}
      <p style="color: #94a3b8; font-size: 12px; margin-top: 16px; text-align: center;">Click an answer to earn reward points 🏆</p>
    </div>
  `;
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

    const now = new Date();
    const currentTime = now.toISOString();
    console.log("Fetching topics due for revision up to:", currentTime);
    const { data: dueTopics, error: fetchError } = await supabase
      .from("learned_topics")
      .select("*")
      .lte("next_revision_date", currentTime)
      .is("deleted_at", null);

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

    const quizBaseUrl = `${supabaseUrl}/functions/v1/handle-quiz-answer`;
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

      // Fetch user rewards for stats in email
      const { data: rewards } = await supabase
        .from("user_rewards")
        .select("*")
        .eq("user_id", userId)
        .single();

      const topicsWithDescriptions = await Promise.all(
        topicsArray.map(async (topic) => {
          const [desc, mcq] = await Promise.all([
            generateTopicDescription(topic.title),
            generateMCQ(topic.title),
          ]);
          console.log("Generated description and MCQ for topic:", topic.title);
          return { ...topic, aiDescription: desc, mcq };
        })
      );

      // Build reward stats banner for email
      const rewardsBanner = rewards
        ? `<div style="background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 16px 24px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
            <span style="font-size: 24px;">${getRankMedal(rewards.rank)}</span>
            <strong style="color: #92400e; font-size: 16px;"> ${rewards.rank}</strong>
            <span style="color: #a16207; margin: 0 12px;">|</span>
            <span style="color: #92400e;">🔥 ${rewards.current_streak} day streak</span>
            <span style="color: #a16207; margin: 0 12px;">|</span>
            <span style="color: #92400e;">⭐ ${rewards.total_points} pts</span>
           </div>`
        : "";

      const emailContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
          <h1 style="color: #0891b2; font-size: 28px; margin-bottom: 10px; font-weight: 600;">🧠 Time to Review Your Topics!</h1>
          <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hello! Here are the topics due for revision today:</p>
          ${rewardsBanner}
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
              ${topic.mcq ? buildQuizHTML(topic.mcq, userId, topic.id, quizBaseUrl) : ""}
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
      const toEmail = userEmail;

      const topicNames = topicsArray.map(t => t.title);
      let emailSubject: string;
      if (topicNames.length === 1) {
        emailSubject = `📚 Hey Buddy "${topicNames[0]}" - Ready for Review`;
      } else if (topicNames.length === 2) {
        emailSubject = `📚 Hey Buddy "${topicNames[0]}" & "${topicNames[1]}" - Ready for Review`;
      } else {
        emailSubject = `📚 Hey Buddy "${topicNames[0]}" & ${topicNames.length - 1} more - Ready for Review`;
      }

      console.log("Sending email with:");
      console.log("FROM:", fromEmail);
      console.log("TO:", toEmail);
      console.log("SUBJECT:", emailSubject);

      try {
        const result = await resend.emails.send({
          from: fromEmail,
          to: [toEmail],
          subject: emailSubject,
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
        const nextRevisionDate = new Date();
        
        if (topic.is_daily) {
          nextRevisionDate.setDate(nextRevisionDate.getDate() + 1);
          console.log(`Topic ${topic.id} is daily - scheduling for tomorrow: ${nextRevisionDate.toISOString()}`);
          await supabase
            .from("learned_topics")
            .update({
              next_revision_date: nextRevisionDate.toISOString(),
            })
            .eq("id", topic.id);
        } else {
          const currentCount = topic.revision_count || 0;
          const nextCount = currentCount + 1;
          const intervalIndex = Math.min(nextCount, REVISION_INTERVALS.length - 1);
          const daysUntilNext = REVISION_INTERVALS[intervalIndex];
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

function getRankMedal(rank: string): string {
  const medals: Record<string, string> = {
    Bronze: "🥉", Silver: "🥈", Gold: "🥇", Platinum: "💎",
    Diamond: "💠", Crown: "👑", Ace: "🏆", Conqueror: "⚔️",
  };
  return medals[rank] || "🥉";
}
