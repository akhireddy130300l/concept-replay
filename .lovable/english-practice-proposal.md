# American English: remember it, sound natural, use it

## Goal
Keep **all nine hourly emails, 9 AM–5 PM Eastern**, plus the **5:30 PM conversation recap**. Evolve American Shadow into a connected learning routine: remember useful expressions, understand connected speech, and speak confidently without a script.

Native-like American speech is a long-term aspiration, not a promised outcome. Progress means clear, natural speech and successful real conversations—not eliminating an accent or opening emails.

## Your daily routine
Each hourly email is a short practice opportunity, normally 1–3 minutes. Nine emails do **not** mean nine new words or nine compulsory lessons. Keep new material to at most three useful phrases a day; forgotten material takes priority. Start with existing words and introduce them gradually into review, rather than assigning the whole archive at once.

| Eastern time | Practice |
|---|---|
| 9 AM | Recall a phrase due from an earlier day before seeing the answer. |
| 10 AM | First new phrase in a realistic situation, with complete-sentence American audio. |
| 11 AM | Recall the morning phrase from a different situation; then reveal and listen. |
| Noon | Second new phrase, emphasizing natural stress, contractions, and connected speech. |
| 1 PM | Mixed delayed review: previously forgotten material and one short spoken answer. |
| 2 PM | Third new phrase, if earlier material is manageable; otherwise review. |
| 3 PM | Transfer: respond to an unfamiliar situation in your own words. |
| 4 PM | Professional speaking: a concise update, explanation, request, or polite disagreement. |
| 5 PM | Recall today's material plus due older phrases; record what was remembered. |

The 5:30 PM recap uses today's introduced/reviewed phrases in a natural Jake–Mia conversation with the existing two-voice audio. It also offers a short retell prompt with the conversation hidden.

No new word or sentence is recycled as **new** content. Previously learned expressions return only as clearly marked review. Stored source audio can be replayed; fresh example sentences remain unique.

## Recall that actually measures learning
- Review starts with a situation, not the phrase, pronunciation, or answer in the subject line.
- A private practice link opens the question first; the answer and model audio appear only after reveal. Email clients cannot reliably support hidden answers or recording.
- Record **Forgot / Hard / Got it** after attempting an answer. These are self-reports, not certified speaking scores.
- A spaced-repetition scheduler uses review results across days and weeks. First-time items start conservatively; forgotten items return sooner. Use an established FSRS implementation rather than inventing a fluency algorithm.
- Unopened emails do not count as learning or forgetting. Missed reviews stay available and are redistributed without increasing the number of emails or creating a punitive backlog.
- On Sundays, the existing nine windows emphasize an unseen-situation check and a weekly summary rather than extra messages.

## American Shadow: keep imitation, add transfer
Preserve the separate, continuous **10-minute shadowing session**: adult male American speech, learner approximately one second behind, no listen–pause–repeat inside the session. Keep the actual 10:00–10:30 duration target at 1x; no silence, looping, duplicate paragraphs, or artificial slowing to meet length.

Add separate stages around it:
1. **Baseline:** a short unscripted recording about a familiar situation; identify one priority such as word stress or explaining an idea clearly.
2. **Shadow:** a coherent scene using a small number of current phrases naturally, not a forced vocabulary list. Copy rhythm and emphasis during the continuous session.
3. **Retell:** hide the script and give a 60–90-second version in your own words.
4. **Respond:** answer an unfamiliar follow-up or handle a related role-play; imitation alone does not demonstrate fluency.
5. **Improve:** give at most two actionable corrections and one retry opportunity. Distinguish phrasing/grammar feedback from pronunciation feedback that requires actual recorded audio.

Start with everyday conversation and add professional tasks as performance improves: opinions, explanations, meeting updates, storytelling, interviews, and disagreement. Spoken answers—not email engagement—guide difficulty. Do not automatically award existing Speaking Gym completions, points, or streaks.

## What improves and how we know
Show a compact English progress view with:
- Delayed phrase recall after at least seven days, with review counts alongside percentages.
- Unscripted speaking attempts and performance on new situations.
- Communication/task completion and priority pronunciation targets.
- Weekly comparable recordings, without a fabricated “native percentage.”

Set a weekly speaking goal after observing baseline usage. AI feedback is fallible; optional real-person conversation or listener feedback is an important check. Faster speech alone is not success.

## Delivery and cost safety first
- Investigate the missed 5 PM window and actual cron configuration before changing scheduling; use `America/New_York` for daylight-saving-safe slot identity and local-time display.
- Persist each scheduled slot and its selected content before external calls. Use atomic per-recipient claims and an email-provider idempotency key; retries must not duplicate email or paid generation.
- Retry transient failures with bounded backoff and respect provider retry instructions. Do not hammer Gemini after quota exhaustion; save the job and retry later. At the window cutoff, carry unfinished learning to the next available slot rather than inventing a successful delivery.
- Send the saved learning email if audio temporarily fails, then expose recovered audio through its practice page. Distinguish provider acceptance from confirmed inbox delivery.
- Generate text in saved batches where useful, validate uniqueness and phrase coverage, and reuse completed audio. Reviews should not require a new AI call simply to show an existing answer.
- Preserve American Shadow's saved full-transcript workflow: normally one Gemini text call, locally split text, minimum TTS-safe chunks, retry only failed chunks, private final recording reused permanently. Do not silently switch providers or run repeated paid tests.

## Technical design
Add English-only learning items, per-user review state, attempts, and delivery jobs. Keep old email history intact and link to it rather than changing existing study tables. Separate recall grades, imitation, pronunciation, and spontaneous speaking evidence; do not use FSRS as a pronunciation or conversational proficiency score.

Email links use scoped, expiring private tokens, not user IDs as authority. Opening a link is read-only because mail scanners follow links; recording grades requires an explicit POST action. Validate permissions in the function, enforce owner-only access, use private recordings, and soft-delete user data. Signed recording URLs can be renewed without synthesis.

Extend only the American English hourly/recap functions, their dedicated helpers, and American Shadow/practice pages. Reuse supported speech capture/audio infrastructure without changing Speaking Gym scoring or its stock-email gate. Leave stocks, ML, historical replay, portfolio, auth settings, LearnLoop revisions, quizzes, rewards, and their schedules untouched.

## Build order and validation
1. Repair/verify hourly delivery and establish protected learning state with scheduling tests.
2. Deliver nine mixed learning/review emails and private recall actions; validate a real user's grade persists and changes the next review.
3. Connect the 5:30 conversation to practice items and saved audio; validate inclusion of all selected phrases and replay without generation.
4. Add retelling and transfer around the unchanged continuous shadow session; verify real recording submission and feedback read-back.
5. Verify desktop/mobile flows, 9 AM and 5 PM boundaries in winter/summer, duplicate triggers, expired links, ignored emails, quotas, and failed audio retries. Evaluate retention and fatigue after two weeks before increasing difficulty or volume.

## Evidence informing the design
- [Anki FSRS](https://docs.ankiweb.net/faqs/frequently-asked-questions-about-fsrs): scheduling based on review outcomes, not listening time.
- [Babbel review](https://support.babbel.com/hc/en-us/articles/205600228-Vocab-workout-Review): performance-based review of words and phrases.
- [Duolingo conversation design](https://blog.duolingo.com/ai-and-video-call/): level-appropriate, goal-directed speaking.
- [ELSA pronunciation feedback](https://elsaspeak.com/en/faqs/how-does-elsas-pronunciation-feedback-work): sounds, stress, and intonation—not one undifferentiated score.
- [Retrieval practice research](https://pubmed.ncbi.nlm.nih.gov/18276894/) and [L2 spacing meta-analysis](https://uwo.scholaris.ca/items/f431513b-1582-423d-998a-7073b78bd87b): retrieval and spacing support delayed retention.
- [Shadowing systematic review](https://ora.ox.ac.uk/objects/uuid:0980cee4-6f49-41c6-8f5f-f48831caf807): promising pronunciation benefits, not proof that imitation alone produces spontaneous fluency.

These are evidence-informed design choices; no study establishes nine hourly emails as the optimal dose. App feature descriptions are precedents, not independent proof of effectiveness.