import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// PUBG-style rank thresholds
const RANKS = [
  { name: "Bronze", minPoints: 0, medal: "🥉" },
  { name: "Silver", minPoints: 50, medal: "🥈" },
  { name: "Gold", minPoints: 150, medal: "🥇" },
  { name: "Platinum", minPoints: 300, medal: "💎" },
  { name: "Diamond", minPoints: 500, medal: "💠" },
  { name: "Crown", minPoints: 800, medal: "👑" },
  { name: "Ace", minPoints: 1200, medal: "🏆" },
  { name: "Conqueror", minPoints: 2000, medal: "⚔️" },
];

function getRank(points: number) {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (points >= r.minPoints) rank = r;
  }
  return rank;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req) => {
  // This endpoint is called via GET from email links
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  const topicId = url.searchParams.get("topic_id");
  const selected = url.searchParams.get("selected");
  const correct = url.searchParams.get("correct");
  const question = url.searchParams.get("question");

  if (!userId || !topicId || !selected || !correct || !question) {
    return new Response(getResultPage("Missing parameters", false, null), {
      headers: { "Content-Type": "text/html" },
      status: 400,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const isCorrect = selected === correct;
  const pointsEarned = isCorrect ? 10 : 2; // 10 for correct, 2 for attempting

  // Check if already answered this quiz (same topic, same question, same day)
  const today = new Date().toISOString().split("T")[0];
  const { data: existing } = await supabase
    .from("quiz_responses")
    .select("id")
    .eq("user_id", userId)
    .eq("topic_id", topicId)
    .eq("question", decodeURIComponent(question))
    .gte("answered_at", `${today}T00:00:00Z`)
    .lte("answered_at", `${today}T23:59:59Z`);

  if (existing && existing.length > 0) {
    return new Response(getResultPage("You already answered this quiz today!", false, null, true), {
      headers: { "Content-Type": "text/html" },
    });
  }

  // Save quiz response
  await supabase.from("quiz_responses").insert({
    user_id: userId,
    topic_id: topicId,
    question: decodeURIComponent(question),
    selected_answer: decodeURIComponent(selected),
    correct_answer: decodeURIComponent(correct),
    is_correct: isCorrect,
  });

  // Update or create user rewards
  const { data: rewards } = await supabase
    .from("user_rewards")
    .select("*")
    .eq("user_id", userId)
    .single();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  if (rewards) {
    const isConsecutive = rewards.last_quiz_date === yesterdayStr || rewards.last_quiz_date === today;
    const newStreak = rewards.last_quiz_date === today
      ? rewards.current_streak // already counted today
      : isConsecutive
        ? rewards.current_streak + 1
        : 1;
    const newTotal = rewards.total_points + pointsEarned;
    const newRank = getRank(newTotal);

    await supabase
      .from("user_rewards")
      .update({
        total_points: newTotal,
        current_streak: newStreak,
        longest_streak: Math.max(newStreak, rewards.longest_streak),
        correct_answers: rewards.correct_answers + (isCorrect ? 1 : 0),
        wrong_answers: rewards.wrong_answers + (isCorrect ? 0 : 1),
        total_quizzes: rewards.total_quizzes + 1,
        rank: newRank.name,
        last_quiz_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return new Response(
      getResultPage(
        isCorrect ? "Correct! 🎉" : `Wrong! The answer was: ${escapeHtml(decodeURIComponent(correct))}`,
        isCorrect,
        { ...rewards, total_points: newTotal, current_streak: newStreak, rank: newRank.name, medal: newRank.medal, pointsEarned }
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  } else {
    const newRank = getRank(pointsEarned);
    await supabase.from("user_rewards").insert({
      user_id: userId,
      total_points: pointsEarned,
      current_streak: 1,
      longest_streak: 1,
      correct_answers: isCorrect ? 1 : 0,
      wrong_answers: isCorrect ? 0 : 1,
      total_quizzes: 1,
      rank: newRank.name,
      last_quiz_date: today,
    });

    return new Response(
      getResultPage(
        isCorrect ? "Correct! 🎉" : `Wrong! The answer was: ${decodeURIComponent(correct)}`,
        isCorrect,
        { total_points: pointsEarned, current_streak: 1, rank: newRank.name, medal: newRank.medal, pointsEarned }
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  }
});

function getResultPage(message: string, isCorrect: boolean, stats: any, alreadyAnswered = false) {
  const bgColor = alreadyAnswered ? "#fef3c7" : isCorrect ? "#d1fae5" : "#fee2e2";
  const textColor = alreadyAnswered ? "#92400e" : isCorrect ? "#065f46" : "#991b1b";
  const emoji = alreadyAnswered ? "⏰" : isCorrect ? "🏆" : "📚";

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quiz Result - LearnLoop</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; text-align: center;">
  <div style="background: ${bgColor}; border-radius: 16px; padding: 40px 24px; margin-bottom: 24px;">
    <div style="font-size: 64px; margin-bottom: 16px;">${emoji}</div>
    <h1 style="color: ${textColor}; font-size: 24px; margin: 0 0 8px 0;">${message}</h1>
    ${stats ? `
      <div style="margin-top: 24px; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <p style="margin: 0 0 8px 0; font-size: 18px;">${stats.medal || "🥉"} <strong>Rank: ${stats.rank}</strong></p>
        <p style="margin: 0 0 4px 0; color: #6b7280;">+${stats.pointsEarned} points earned</p>
        <p style="margin: 0 0 4px 0; color: #6b7280;">Total: <strong>${stats.total_points} pts</strong></p>
        <p style="margin: 0; color: #6b7280;">🔥 Streak: <strong>${stats.current_streak} day(s)</strong></p>
      </div>
    ` : ""}
  </div>
  <p style="color: #6b7280; font-size: 14px;">Keep learning with <strong style="color: #0891b2;">LearnLoop</strong> 🧠</p>
</body>
</html>`;
}
