# Project: Strength Training Tracker

A local-first Android strength training tracker built with Expo and React Native. Sessions, exercises, templates, and set logs are stored on-device using expo-sqlite via Drizzle ORM.

---

## Stack

- **Framework:** Expo (managed workflow), targeting Android
- **Language:** TypeScript (strict mode)
- **UI:** React Native with Expo Router (file-based routing)
- **Database:** expo-sqlite via Drizzle ORM
- **Package manager / runtime / bundler / test runner:** Bun
- Do not use `npm`, `npx`, or `tsc` — use `bun` equivalents only

---

## Project Structure

```
app/                    # Expo Router file-based routes
  (tabs)/               # Bottom tab navigator screens
  exercise/             # Exercise detail and creation
  session/              # Active session view
  template/             # Template detail and creation
  workout/              # Workout detail
components/
  ui/                   # Reusable primitive components (Button, Card, TextField)
constants/              # Theme, colors, navigation theme
db/
  client.ts             # Drizzle client setup
  init.ts               # DB initialization
  schema.ts             # Drizzle schema definitions (source of truth)
lib/
  queries.ts            # All Drizzle queries — do not write raw SQL elsewhere
```

---

## Database

The app uses **Drizzle ORM** with **expo-sqlite**. All queries must go through `lib/queries.ts` using Drizzle's query builder. Do not write raw SQL strings.

### Schema Overview

**`exercises`** — Exercise library  
`id` (text PK), `name`, `notes`, `created_at`

**`workout_templates`** — Reusable workout templates  
`id` (text PK), `name`, `notes`, `created_at`

**`template_exercises`** — Exercises within a template (ordered)  
`id`, `template_id` → `workout_templates`, `exercise_id` → `exercises`, `sort_order`

**`template_sets`** — Target sets within a template exercise  
`id`, `template_exercise_id` → `template_exercises`, `index`, `target_reps`, `target_weight` (real)

**`workouts`** — A completed or in-progress workout session  
`id`, `template_id` → `workout_templates` (nullable, set null on delete), `name`, `started_at`, `completed_at` (nullable)

**`workout_exercises`** — Exercises logged in a workout (ordered)  
`id`, `workout_id` → `workouts`, `exercise_id` → `exercises`, `sort_order`

**`set_logs`** — Individual set results  
`id`, `workout_exercise_id` → `workout_exercises`, `index`, `reps`, `weight` (real), `completed` (boolean via integer)

### Conventions
- All PKs are `text` — use UUIDs
- Timestamps are stored as `text` (ISO 8601)
- Cascade deletes are in place for all child relationships except `workouts.template_id` (set null)
- Weights and target weights are `real` (float)
- Do not alter the schema without updating `db/schema.ts` and running a migration via Drizzle

---

## Code Style

- TypeScript strict mode is enforced — no `any`, no implicit nulls
- Use well-established design patterns appropriate to React Native (container/presentational, custom hooks for logic)
- Keep query logic in `lib/queries.ts` — screens and components should not import from `db/` directly
- Prefer `const` and functional components with hooks
- Do not use web-React patterns that don't translate to React Native (e.g. `div`, `onClick`, CSS stylesheets)
- Use Expo and React Native APIs — do not assume browser APIs are available

---

## UI/UX

- Prioritize a polished, modern UI appropriate for a fitness app
- Use components from `components/ui/` for consistency — extend them before creating new primitives
- Theming lives in `constants/theme.ts` and `constants/Colors.ts` — do not hardcode colors
- Target Android — account for Android-specific back gesture behavior and keyboard handling

---

## Documentation

- After implementing a significant feature or plan, include or update `README.md`
- If `README.md` already exists, review whether your changes require updates

---

## Security

- Treat security as a first-class concern
- Refuse to implement patterns that expose sensitive data or introduce vulnerabilities
- All data is stored locally on-device — do not introduce network calls or external data transmission without explicit instruction

---

## Development Environment

- OS: Arch Linux
- Shell: fish
- AUR helper: yay
- When suggesting system-wide tools or dependencies, check the Arch repositories or AUR before recommending other installation methods (e.g. do not default to `apt` or `brew`)
