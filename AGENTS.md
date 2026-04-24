# Project: MovingWeight

MovingWeight is a local-first Android strength training tracker built with Expo and React Native. It supports exercise logging, workout templates, mesocycle planning, progress charts, and built-in theme selection. Data stays on-device.

This file is meant to be a practical future handoff: it keeps the project rules, but also captures enough current structure and behavior that you should not need to re-scan the whole codebase to get oriented.

---

## Stack

- **Framework:** Expo managed workflow, Android-first
- **Language:** TypeScript with strict mode
- **Routing:** Expo Router
- **UI:** React Native + small custom primitive library in `components/ui/`
- **Storage / DB:** `expo-sqlite` with Drizzle ORM
- **Lightweight local key-value storage:** `expo-sqlite/kv-store`
- **Package manager / test runner / scripts:** Bun
- Use `bun` / `bunx` equivalents only. Do not switch to `npm`, `npx`, or raw `tsc`.

---

## Current App Surface

### Main user flows

- **Home**: start an empty workout, jump into active workouts, navigate to the library/history.
- **Exercises**: browse, create, edit, delete, and review progress charts per exercise.
- **Templates**: create reusable workouts with ordered exercises and default sets.
- **Mesocycles / Blocks**: create longer training blocks, define ordered workouts, mark focus lifts, and generate week-specific workouts from stored percentages.
- **History**: browse completed workouts.
- **Settings**: currently used for theme selection.

### Important current UX decisions

- Theme selection is fully app-driven and persisted locally. Do not reintroduce hard-coded global theme imports inside screens/components.
- Mesocycles are currently modeled as an **ordered list of workouts**, even though the DB column is still named `day_number`. Treat that field as workout order, not literal calendar day. This matters because rest days may exist between workouts.
- The mesocycle builder intentionally uses **string-backed input editing** for percentage and rep fields so users can type partial numeric values like `.5` or `72.5` without aggressive coercion.
- The mesocycle builder supports **duplicate workout** and **duplicate all workouts** flows to make split-based programming like PPL repeated twice per week much faster to create.

---

## High-Level File Map

```text
app/
  _layout.tsx                # Root app shell, theme provider, nav theme wiring
  settings.tsx               # Settings screen (currently theme selection)
  (tabs)/
    _layout.tsx              # Tabs, themed nav chrome, settings entry point
    index.tsx                # Home
    exercises.tsx            # Exercise library
    templates.tsx            # Workout templates list
    mesocycles.tsx           # Mesocycle / block list
    history.tsx              # Completed workouts
  exercise/
    new.tsx                  # Create exercise
    [id].tsx                 # Edit exercise + charts
  template/
    new.tsx                  # Create template shell
    [id].tsx                 # Edit template structure
  mesocycle/
    new.tsx                  # Create mesocycle metadata
    [id].tsx                 # Mesocycle builder / ordered workout editor
    start/[id].tsx           # Collect focus-lift maxes
    active/[id].tsx          # Active block screen by week
  workout/[id].tsx           # Live workout logger
  session/[id].tsx           # Completed workout detail

components/
  theme/
    AppThemeProvider.tsx     # Theme context + persistence
    useThemedStyles.ts       # Helper for theme-driven StyleSheet creation
  ui/
    Button.tsx
    Card.tsx
    TextField.tsx
    SettingsSection.tsx      # Reusable settings rows/sections

constants/
  theme.ts                   # Built-in app themes and shared tokens
  navigationTheme.ts         # React Navigation mapping from app theme

db/
  client.ts                  # SQLite + Drizzle singleton init
  init.ts                    # Raw SQL migrations + seed data
  schema.ts                  # Drizzle schema source of truth

lib/
  queries.ts                 # All app data access and write operations
  utils.ts                   # Formatting helpers used by workout/history UIs
```

---

## Theme System

The app no longer uses a single static dark token object in practice, even though `constants/theme.ts` still exports `theme` as the default theme value for compatibility.

### Current theme architecture

- `constants/theme.ts`
  - Defines `ThemeId`
  - Defines `AppTheme`
  - Exposes `builtInThemes`, `defaultThemeId`, `getThemeById()`
  - Current built-in themes: `midnight`, `forest`, `ember`
- `components/theme/AppThemeProvider.tsx`
  - Loads the persisted theme id from `expo-sqlite/kv-store`
  - Exposes `useAppTheme()` and `useThemePreference()`
- `components/theme/useThemedStyles.ts`
  - Preferred helper for `StyleSheet.create(...)` with active theme tokens
- `constants/navigationTheme.ts`
  - Converts an `AppTheme` to a React Navigation theme
- `app/_layout.tsx`
  - Wraps the app in `AppThemeProvider`
  - Applies navigation theme
  - Sets `SystemUI` background color from the active theme
- `app/settings.tsx`
  - Theme picker UI

### Theme guidance

- Inside screens and reusable components, prefer:
  - `const theme = useAppTheme()`
  - `const styles = useThemedStyles(createStyles)`
- Avoid importing the fallback `theme` constant into live UI code unless there is a specific reason.
- Do not hardcode colors in screens unless the value is clearly not part of the design system.

---

## Database

The app uses Drizzle ORM over `expo-sqlite`, but migrations currently live in raw SQL inside `db/init.ts`. If you change schema, update **both**:

- `db/schema.ts`
- `db/init.ts`

Do not add ad hoc SQL elsewhere in the app. All app-level reads/writes belong in `lib/queries.ts`.

### Core tables

**`exercises`**
- Exercise library
- `id`, `name`, `notes`, `created_at`

**`workout_templates`**
- Reusable template metadata
- `id`, `name`, `notes`, `created_at`

**`template_exercises`**
- Ordered exercises inside a template
- `template_id`, `exercise_id`, `sort_order`

**`template_sets`**
- Default sets for a template exercise
- `template_exercise_id`, `index`, `target_reps`, `target_weight`

**`workouts`**
- Logged workout session
- `template_id` nullable
- `active_mesocycle_id` nullable
- `mesocycle_week` nullable
- `name`, `started_at`, `completed_at`

**`workout_exercises`**
- Ordered exercises inside a logged workout

**`set_logs`**
- Logged sets with `reps`, `weight`, `completed`

### Mesocycle tables

**`mesocycles`**
- Block metadata
- `name`, `weeks`, `notes`, `created_at`

**`mesocycle_workouts`**
- Ordered workouts in a block
- Current schema column is `day_number`, but in the UI/business logic this is better thought of as **workout order**
- `name` is user-editable and should be meaningful (`Push A`, `Legs`, `Upper 2`, etc.)

**`mesocycle_exercises`**
- Ordered exercises inside a mesocycle workout
- `is_focus` distinguishes percentage-driven lifts from accessories

**`mesocycle_sets`**
- Focus lift sets: one row per week with `week_number`
- Accessory sets: `week_number = null`, reused every week
- `target_percentage` is nullable and only applies to focus lifts

**`active_mesocycles`**
- Running block instance

**`active_mesocycle_maxes`**
- Stored training maxes / 1RM inputs used to convert percentages to workout weights

### Useful conventions

- All IDs are text IDs generated in app code
- Timestamps are ISO 8601 strings
- Child tables generally use cascade deletes
- `workouts.template_id` and `workouts.active_mesocycle_id` use set-null semantics

---

## Query Layer Notes

`lib/queries.ts` is the single most important file for app behavior.

### Template-related

- `listTemplates()`
- `getTemplateDetail()`
- `createTemplate()`
- `updateTemplateMeta()`
- `replaceTemplateStructure()`
- `startWorkoutFromTemplate()`

### Workout-related

- `createEmptyWorkout()`
- `getWorkoutDetail()`
- `addExerciseToWorkout()`
- `addSetToWorkoutExercise()`
- `removeLastSet()`
- `updateSetLog()`
- `moveWorkoutExercise()`
- `removeWorkoutExerciseBlock()`
- `completeWorkout()`
- `abandonWorkout()`
- `listWorkoutHistory()`
- `getLastWorkoutDataForExercises()`

### Mesocycle-related

- `createMesocycle()`
- `getMesocycleDetail()`
- `replaceMesocycleStructure()`
- `startActiveMesocycle()`
- `listActiveMesocycles()`
- `getActiveMesocycleDetail()`
- `startWorkoutFromMesocycleDay()`
- `completeActiveMesocycle()`
- `deleteActiveMesocycle()`

### Important mesocycle behavior

- `replaceMesocycleStructure()` currently rewrites the full structure by deleting existing mesocycle workouts/exercises/sets and inserting the new ordered structure.
- `getMesocycleDetail()` sorts workouts by `day_number`; that is effectively the workout order shown in the UI.
- `startWorkoutFromMesocycleDay()`
  - Builds a real workout from one stored mesocycle workout
  - Pulls week-specific focus sets for the requested week
  - Pulls accessory sets where `week_number IS NULL`
  - Converts percentages into actual target weights using `active_mesocycle_maxes`

---

## Mesocycle Builder Notes

The mesocycle builder in `app/mesocycle/[id].tsx` has a few non-obvious implementation details:

- Workout rows are editable sessions, not literal weekdays.
- Focus lifts:
  - toggling a movement to focus mode regenerates one set entry per week
  - percentage inputs are string-backed to allow partial decimal input
- Accessory lifts:
  - use one or more reusable sets with no `week_number`
- There are convenience actions for:
  - adding a workout
  - duplicating a single workout
  - duplicating all workouts
- If you change the builder data shape, keep the save transform aligned with `replaceMesocycleStructure()`

If you need to support literal weekdays or scheduled rest days in the future, that should likely be modeled explicitly instead of overloading `day_number`.

---

## UI / UX Guidance

- Reuse `components/ui/` primitives where possible.
- For new settings-style screens, use `components/ui/SettingsSection.tsx`.
- Preserve the current fitness-app visual language:
  - dark surfaces
  - strong accent color
  - dense but readable cards
  - large touch targets for active workout flows
- Android matters most:
  - back navigation should be predictable
  - keyboard interactions should not trap inputs
  - avoid tiny controls in workout logging

---

## Testing / Verification

Current lightweight verification commands:

```bash
bun run typecheck
bun test
```

There are Bun tests for:

- utility formatting
- query behavior
- mesocycle creation / active block flows

If you change mesocycle persistence or query behavior, update/add tests in `__tests__/mesocycles.test.ts`.

---

## Documentation

- Update `README.md` after significant user-facing changes.
- Keep `AGENTS.md` aligned with current architecture and hidden project knowledge.
- `README.md` is user-facing.
- `AGENTS.md` is contributor/agent-facing.

---

## Security / Product Constraints

- Data is local-first and should remain on-device unless explicitly asked otherwise.
- Do not introduce network sync, analytics, or background uploads without explicit instruction.
- Be cautious with anything that touches credentials or email-related environment variables already present in local env files.

---

## Development Environment

- OS: Arch Linux
- Shell: fish for the user, but commands may run under bash in tooling
- AUR helper: `yay`
- Prefer Arch / AUR when suggesting system packages
