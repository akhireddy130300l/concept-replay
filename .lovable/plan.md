# Signed-in App Redesign (look only, nothing breaks)

The last change only touched the public home page. This plan redesigns every page you see **after signing in**, inspired by the world's best product UIs (Apple Health/Fitness, Linear, Stripe Dashboard, Arc). All buttons, data, emails, toggles, quizzes and ML features keep working exactly as today.

## Design direction
- Calm, premium "glossy iPhone" look: frosted glass panels, soft depth, generous spacing, crisp typography (SF Pro / system font).
- One consistent color system with dark mode support; no random colors per card.
- Clear hierarchy: big friendly greeting, then today's most important things, then details.
- Smooth, subtle motion (fade/slide), no flashy effects.

## 1. New app shell (all signed-in pages)
- Desktop: slim left sidebar with icons + labels: Dashboard, Start Today, Speaking Gym, American Shadow, Stock Insight, ML Training, Portfolio, Sign Out.
- Phone: bottom tab bar (like iOS) with the 4 main sections + "More" sheet.
- Active page highlighted; replaces the crowded row of header buttons.

## 2. Dashboard
- Hero: "Good afternoon, Akhi" + date, with a 3-tile "Today" strip (reviews due, streak, rank points).
- Rank & rewards as a single elegant ring/progress card.
- Automation Status and Model Performance restyled as clean status tiles (green/amber/grey dots, one-line summaries, details on tap).
- "Add New Topic" becomes a compact, focused composer card.
- Learning Journey list: cleaner rows with next-review chip, Daily toggle and actions grouped in a tidy menu.
- Quiz timeline and reminder settings restyled to match, collapsed by default.

## 3. Other signed-in pages
Speaking Gym, Start Today, American Shadow, Stock Insight, ML Training, Portfolio, Auth and Reset Password get the same shell, page headers, cards, buttons and empty/loading states, so the whole app feels like one product.

## 4. Safety
- Only visual/layout code changes; no backend, email, schedule, scoring or data logic touched.
- Every existing button and link kept (same actions).
- Check every page signed-in on phone (402px) and desktop with screenshots before finishing.

## Technical details
- Add shared `AppShell` layout (sidebar + mobile tab bar) and reusable `PageHeader`, `StatTile` components in `src/components/layouts`.
- Refine tokens in `src/index.css` / `tailwind.config.ts` (surfaces, borders, shadows, status colors); replace hardcoded colors (amber/rose/green utilities) with semantic tokens.
- Wrap routes in App.tsx with the shell; restyle JSX in pages without changing handlers, queries or state.
