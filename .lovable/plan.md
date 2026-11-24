# Concept Replay: Improvement Ideas

Concept Replay already has four parts: revision reminders and quizzes, hourly American English emails, the Speaking Gym, and the stock and swing research emails. These ideas link them together so the app helps with daily habits, not just sending emails. Pick the ones you want and I will build them in that order.

## Tier 1: Biggest impact, low effort

1. **One morning "Today" page.** One screen for the day: English phrases due, topics to review, the Speaking Gym task, the stock pick and a single progress ring. You open one page instead of many emails.
2. **Reply-to-email practice.** You reply to an English email with your own sentence. The AI grades it and the score counts toward your streak. This builds active recall without opening the app.
3. **Weekly report email (Sunday evening).** Phrases learned, what you remembered, speaking minutes, quiz accuracy, stock pick results and one goal for next week.
4. **Busy-day mode.** One switch for travel or busy days. All emails shrink to one short summary and streaks pause without breaking.

## Tier 2: New ways to learn

5. **Speak the phrase back.** Each English email has a 20-second recording link. The Speaking Gym checks your pronunciation of that phrase. This covers the missing speaking practice in the English emails.
6. **Paper-trading journal.** Each stock pick is logged as a pretend trade. After 10 trading days you get a short note: what happened, and whether you would have followed the pick. This builds trading discipline without real money.
7. **Mistake notebook.** Wrong quiz answers, misheard phrases and losing picks go into one list, and those items are reviewed more often.
8. **Interview and meeting rehearsal.** 5-minute role-play practice (standup, client call, interview) using phrases you have already learned.

## Tier 3: Life and wellbeing

9. **Daily reflection (1 minute, 9 PM).** Three quick questions: a win, a lesson and tomorrow's priority. It goes into a searchable journal and feeds the weekly report.
10. **Goal tracker linked to the app.** For example "Speak fluently in meetings by March" or "Read 12 books". Each goal shows progress from your actual activity.
11. **Indian Law and general-knowledge cards.** Turn the existing 6 PM lessons into review cards so they are not forgotten.

## Reliability and upkeep

- One "health" line on the dashboard: shows if any email was missed today, with a one-tap resend.
- Monthly cost and usage summary covering AI, image and voice credits.
- Fix the Gemini image quota later, either by enabling Google billing or by keeping pictures optional.

## Suggested order
Today page, then reply-to-email practice, then weekly report, then busy-day mode, then the rest.

## Technical notes
- New items are added on top of the existing app. Existing schedules, stock-selection rules and the ML promotion gate stay unchanged.
- Reply grading needs incoming email (Resend inbound) or a reply link to a small in-app form. The form is simpler and more reliable.
- The weekly report and reflection reuse the existing scheduled jobs, run lock and safe-resend pattern.
