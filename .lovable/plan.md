# "Start Today" — Future Regret Radar

## The idea
You often see people who started something early (a skill, an investment, a habit, a side business) and think, "I wish I had started back then." This feature tries to prevent that. Every day it finds rising trends that could matter to you in 3–10 years. It then gives you one small step you can take today.

## What you get
- **A daily email at 8 AM Eastern called "Start Today":**
  - **One rising opportunity**, such as a growing skill (AI agents, cloud security), a growing market, a useful habit or a new kind of career. It includes why it is growing, with real recent signals (news, job demand, adoption).
  - **The "5 years from now" picture**: what people who start today could have by then.
  - **A 15-minute first step for today**, such as a free lesson, one small action or one question to look into.
  - **Fit for you**: it matches your topics, English goals, stock interests and career.
- **A "Start Today" page in the app:**
  - Mark each idea **Started**, **Later** or **Not for me**. The AI learns what you like.
  - The ideas you started become small weekly steps, with progress checks in your review emails.
  - Every 30, 90 and 365 days you get a "**Look how far you came**" email. It shows what you started and how long you've kept going. This replaces "I should have" with "I did".

## Safety and honesty
- Ideas are based on real current sources, and every claim has a link.
- No guaranteed money claims. Investment ideas are for learning only and never change your stock picks.
- Ideas never repeat (the same no-repeat approach as the English emails).

## Technical notes
- New tables: `opportunity_ideas` (topic, category, signals, sources, first_step, sent_at) and `opportunity_actions` (user, idea, status, check-ins). Both have RLS (only you can access your rows), use soft delete, and have unique normalized topics.
- New scheduled function `send-start-today-email`, which runs daily. It uses web search to find recent signals and Gemini to write the idea. It uses the same run lock and safe-resend setup as the other emails, and the HTML email uses inline styles.
- New `/start-today` page in the glossy iPhone style, with a link from the dashboard.
- A milestone job sends the 30/90/365-day progress emails.
- Unit tests cover idea deduplication and milestone timing. Existing features stay unchanged.
