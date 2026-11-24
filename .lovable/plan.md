# "Start Today" — Future Regret Radar

## The idea
You see people who started something early and think "I should have started back then." This feature stops that from happening again. Every day it searches the whole world (news, research, jobs, markets, creators, communities, every country) for things that are rising now and could change lives in 3–10 years. Then it tells you how to start today.

The rule: **anyone can learn or do anything.** Ideas are never limited to your current job, skills or background.

## Search everything, every field
Ideas rotate across all areas of life and never stick to one topic:
- Money: investing, new asset types, side income, businesses and online selling
- Career: skills employers will need, new job types, freelancing, certifications
- Technology: AI, robotics, energy, biotech, space, chips and tools anyone can use
- Creative: content creation, writing, music, design, video and personal brands
- Health and body: fitness, nutrition, sleep, longevity and mental strength
- Mind: languages, public speaking, reading, thinking and memory skills
- Life: relationships, networking, travel, real estate, location and lifestyle choices
- Society: rising countries and cities, policy changes and new opportunities opening up
- Hobbies and craft: practical skills (cooking, repair, farming, art) that grow into something bigger

## What you get
- **Daily "Start Today" email at 8 AM Eastern** with **3 ideas from 3 different fields** (for example, one about money, one skill and one about life). Each idea has:
  - Why it's rising, with real signals and source links from recent news, data and trends
  - "5 years from now": where people who start today could be
  - "Who's already doing it": real examples, so you can see it's possible
  - **A 15-minute first step you can take today**, free or cheap
  - Difficulty, cost and time needed, shown honestly
- **A "Wild card" idea once a week**: something completely outside your usual interests, to widen your view.
- **A "Start Today" page in the app:**
  - Mark each idea **Started**, **Later** or **Not for me**. Future picks learn from this but still stay varied across fields.
  - Started ideas turn into small weekly steps with progress check-ins.
  - **Ask anything:** type "I want to get into X" and get a researched start plan for it, whatever it is.
  - **"Look how far you came" emails at 30, 90 and 365 days** show what you started and kept doing. "I should have" becomes "I did."

## Safety and honesty
- Every claim comes from real current sources, with links.
- No guaranteed-money claims. Investment ideas are for learning only and never change your stock picks.
- No idea ever repeats.

## Technical notes
- New tables: `opportunity_ideas` (field, topic, signals, sources, examples, first_step, difficulty, sent_at) with a unique normalized topic, and `opportunity_actions` (user, idea, status, check-ins). RLS limits rows to their owner, and deletes are soft deletes.
- New scheduled function `send-start-today-email` runs daily. It runs a broad web search per field (rotating fields so 3 different ones appear each day), and Gemini writes and verifies the ideas against the sources. It reuses the existing run-lock and safe-resend pattern, and the email is HTML with inline styles.
- On-demand "Ask anything" function: authenticated, rate-limited, and uses the same search plus Gemini.
- New `/start-today` page in the glossy iPhone style, with a link from the dashboard.
- A milestone job sends the 30/90/365-day emails.
- Unit tests cover field rotation (3 distinct fields per day), deduplication and milestone timing. Existing features stay unchanged.
