# Speaking requirement toggle for stock emails

## What you get
A switch on the Speaking Gym page: **"Require speaking for stock emails"**.
- **On** — works exactly like today: stock emails only arrive if you kept up your daily speaking (same warning day and pause rules).
- **Off** — stock emails arrive on their normal schedule no matter whether you spoke. No warning banner, no pause. Your speaking streak keeps counting as usual.

The switch defaults to **On**, so nothing changes until you flip it. You can flip it back anytime and it takes effect from the next scheduled stock email.

## Technical details
- Add a new column `require_speaking_for_stock boolean not null default true` to `speaking_user_state` (additive only).
- `supabase/functions/send-revision-reminders/index.ts`: also select the new column; when false, treat the gate as "inactive" (skip pause and warning banner). Everything else in the stock flow is untouched.
- `src/pages/Speaking.tsx`: add a Switch next to the gate status card that updates the column for the signed-in user; the status card shows "Speaking not required" when off.
- Add a small test: gate off → email sends even if last speaking was days ago; gate on → existing pause behavior.
- Redeploy the stock email function.
