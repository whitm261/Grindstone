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
- **Exercises**: browse, create, edit, archive/restore, and review progress charts per exercise.
- **Templates**: create reusable workouts with ordered exercises and default sets.
- **Mesocycles / Blocks**: create longer training blocks, define ordered workouts, mark focus lifts, and generate week-specific workouts from stored percentages.
- **History**: browse completed workouts.
- **Settings**: currently used for theme selection.

### Important current UX decisions

- Theme selection is fully app-driven and persisted locally. Do not reintroduce hard-coded global theme imports inside screens/components.
- Workout inputs remain raw strings while editing. Validate checked sets only on **Finish**, never during typing, blur, or checking a set. Finish explicitly confirms that unchecked sets will be skipped and removed.
- The default progress chart shows the heaviest completed weight per workout with that set's reps. Zero weight is valid for bodyweight/no added weight; volume is a secondary workload measure.
- Exercise removal means archival. Keep exercise identities and references intact so logged history, templates, and active block snapshots remain usable.
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
  workout/
    SetRow.tsx               # Controlled set inputs and completion checkbox
    useWorkoutDraft.ts       # Workout-level draft state, immediate local saves/retry

constants/
  theme.ts                   # Built-in app themes and shared tokens
  navigationTheme.ts         # React Navigation mapping from app theme

db/
  client.ts                  # SQLite + Drizzle singleton init
  init.ts                    # Raw SQL migrations + seed data
  schema.ts                  # Drizzle schema source of truth

lib/
  queries.ts                 # All app data access and write operations
  workoutDraft.ts            # Pure raw draft types/reconciliation and explicit validation
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

Migrations update `PRAGMA user_version` inside each migration transaction. Opening a newer-than-supported database fails without downgrading it. `db/client.ts` caches a connection only after initialization succeeds, closing failed connections so a retry can rerun initialization. The current schema version is 3.

### Core tables

**`exercises`**
- Exercise library
- `id`, `name`, `notes`, `created_at`, nullable `archived_at`
- `listExercises()` excludes archived entries; `listExercises({ archived: true })` returns archived entries only
- `getExercise()` and existing program/history reads retain access to archived exercises

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
- `mesocycle_slot_id` nullable; identifies a workout slot in the active block snapshot, with no foreign key to the editable definition
- Unique index on `active_mesocycle_id`, `mesocycle_slot_id`, and `mesocycle_week`
- `name`, `started_at`, `completed_at`

**`workout_drafts`**
- One row per unfinished workout: `workout_id` primary key, JSON `payload`
- Versioned payload stores the raw workout name and string reps/weight plus completion state, keyed by set ID
- Cascade-deleted when a workout is discarded; removed in the same transaction that finishes a workout

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
- Nullable `structure_snapshot` JSON stores the full `MesocycleDetail` captured at start, including stable workout slot IDs
- Null is reserved for older blocks awaiting snapshot adoption

**`active_mesocycle_maxes`**
- Stored training maxes / 1RM inputs used to convert percentages to workout weights

### Useful conventions

- All IDs are text IDs generated in app code
- Timestamps are ISO 8601 strings
- Child tables generally use cascade deletes
- Never hard-delete library exercises: physical cascade relationships still exist. `archiveExercise()` and the compatibility `deleteExercise()` both archive; `restoreExercise()` clears the archive timestamp.
- `workouts.template_id` and `workouts.active_mesocycle_id` use set-null semantics

---

## Query Layer Notes

`lib/queries.ts` is the single most important file for app behavior.

### Exercise-related

- `listExercises()`, `getExercise()`, `createExercise()`, `updateExercise()`
- `archiveExercise()`, `restoreExercise()`
- `getExerciseProgressHistory()`
- Progress and `getLastWorkoutDataForExercises()` share the performed-set selector: checked sets in finished workouts, positive integer reps, finite nonnegative weight. Combine repeated blocks of the same exercise and ignore empty/skipped sessions.
- The heaviest-set tie breaker is the most reps; chart points include workout identity/date, weight, reps, volume, and completed-set count.

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
- `getWorkoutDraft()`
- `saveWorkoutDraft()`
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

### Workout draft behavior

- `lib/workoutDraft.ts` owns `WorkoutDraft`, `SetDraft`, structural reconciliation, and numeric parsing/validation. It performs no database operations.
- `components/workout/useWorkoutDraft.ts` owns the current draft independently of rendered/collapsed rows. Changes update the current draft immediately and save raw strings synchronously through the query layer. Save failures remain visible with retry.
- Structural reloads preserve raw input for existing set IDs. Adding a set copies the latest raw reps/weight from the preceding set, including partial text.
- Set checkboxes, add controls, and Finish consume current draft state directly; they must not depend on blur, debounced saves, or reloading parsed values.
- `completeWorkout()` validates checked sets and atomically writes their numeric values, deletes unchecked sets, marks the workout complete, and deletes the draft. Failure preserves the unfinished workout and draft.
- Positive whole-number reps and finite weights of zero or more are valid. Unchecked sets are skipped without numeric validation, after explicit confirmation in the screen. Finishing with zero performed sets also requires explicit confirmation.
- `SetRow.tsx` contains controlled inputs. Keep `keyboardShouldPersistTaps="handled"` on logger/picker scroll containers and `onRequestClose` on modals for Android Back.

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
- Active blocks use an immutable snapshot captured by `startActiveMesocycle()`. Before rewriting a reusable definition, capture snapshots for older blocks that still have null snapshots.
- `deleteMesocycle()` returns `false` without changes if any running or completed block instance references the definition. The UI explains that used plans cannot be deleted; unused definitions can still be deleted. Keep this guard because the physical parent relationship still cascades.
- `getActiveMesocycleDetail()` also adopts missing legacy snapshots. Legacy sessions receive a slot ID only when their exact generated name and week identify a unique slot and a unique session; ambiguous history remains unassigned and preserved.
- `getMesocycleDetail()` sorts workouts by `day_number`; that is effectively the workout order shown in the UI.
- `startWorkoutFromMesocycleDay()`
  - Builds a real workout from one slot in the active block snapshot
  - Pulls week-specific focus sets for the requested week
  - Pulls accessory sets where `week_number IS NULL`
  - Converts percentages into actual target weights using `active_mesocycle_maxes`
  - Returns the existing session for the same active block, slot, and week instead of creating duplicates
- The active block screen refreshes on focus, opens unfinished sessions in `/workout/[id]`, and opens completed sessions in `/session/[id]`. Completion tracking uses slot IDs, never name prefixes.

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
- performed-set progress calculations, bodyweight sessions, and exercise archival
- fresh/legacy database migrations, rollback/version handling, and connection initialization retries

`__tests__/helpers/db.ts` runs the production migrations against an in-memory Bun SQLite adapter with `seed: false`; do not maintain a separate test schema. Migration fixtures apply historical production migrations before upgrading, including templates, logged history, active maxes, and ambiguous legacy sessions.

If you change mesocycle persistence or query behavior, update/add tests in `__tests__/mesocycles.test.ts`.

Android device/emulator verification is still required; Bun tests do not establish keyboard or touch behavior. Check:

- Type a partial decimal, immediately check a set or add a set/exercise, and verify the first tap works without scrolling or losing text.
- Collapse/reopen exercises and leave/reopen an unfinished workout; confirm raw drafts survive, including an app restart.
- Finish with an invalid checked set and verify inline errors; finish with unchecked sets and verify the confirmation and resulting history. Check zero-weight sets too.
- Dismiss exercise pickers using Android Back, inspect bodyweight chart points, and resume a block workout after editing its reusable definition.

---

## Documentation

- Update `README.md` after significant user-facing changes.
- Keep `AGENTS.md` aligned with current architecture and hidden project knowledge.
- `README.md` is user-facing.
- `docs/android-build.md` contains Android prerequisites, secure signing setup, APK installation, and local development commands.
- `AGENTS.md` is contributor/agent-facing.

---

## Security / Product Constraints

- Data is local-first and should remain on-device unless explicitly asked otherwise.
- Do not introduce network sync, analytics, or background uploads without explicit instruction.
- Be cautious with anything that touches credentials or email-related environment variables already present in local env files.

---

## Development Environment

### Local APK workflow

- `bun run apk` runs `scripts/build-apk.ts`; `bun run apk --check` checks prerequisites and the private signing key without prebuild/build.
- `bun run apk:install` runs `scripts/install-apk.ts`; supports `--apk`, `--serial`, and `ANDROID_SERIAL`. `--check` performs read-only compatibility checks on the phone without installing. Default artifact is the ignored `builds/movingweight.apk`.
- Shared tooling is in `scripts/android-tools.ts`, and Java properties/signing checks are in `scripts/apk-signing.ts`. Tests mock subprocesses but exercise artifact publication, device selection, and update compatibility.
- Build runs Expo prebuild for Android with `--no-install`, then Gradle `:app:assembleRelease` with all four Android architectures. Native directories stay generated/ignored; do not put durable manual changes or keystores there.
- `plugins/with-local-apk-signing.cjs` appends an idempotent Gradle block. Only `-Pmovingweight.localApk=true` activates it, leaving EAS signing and ordinary development builds independent. Use a config plugin for persistent native changes.
- JDK 17, SDK API 36, Build-Tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, Platform-Tools, and Command-line Tools (latest) are required. Keep the pinned SDK checks aligned with native dependencies when upgrading Expo/RN.
- Credentials come from owner-only `~/.config/movingweight/signing/gradle.properties` (`XDG_CONFIG_HOME` is supported), falling back to private `~/.gradle/gradle.properties` (or `GRADLE_USER_HOME`). Keys are `MOVINGWEIGHT_STORE_FILE`, `MOVINGWEIGHT_STORE_PASSWORD`, `MOVINGWEIGHT_KEY_ALIAS`, and `MOVINGWEIGHT_KEY_PASSWORD`. Explicit `ORG_GRADLE_PROJECT_…` environment values override both files. Passwords are passed to subprocesses through environments, not command arguments or generated source.
- Store the key, notes, and backup archive outside the repository under the same `signing/` directory (directory mode 700, files 600). The build rejects keystores resolving inside the repository, including symlinks. Keep Git ignore rules for EAS backup ZIPs and credential notes as well as raw keystores; ignore rules alone do not protect already tracked files.
- Existing APKs require the same signing key; inspect the actual installed certificate rather than assuming EAS provenance. A formerly debug-signed local app can use an explicit private copy of its matching debug keystore for personal updates. There is no automatic signing fallback. Preserve the separate EAS backup and its settings. Certificate mismatches display both public SHA-256 fingerprints.
- The current phone installation was verified as debug-signed. Its matching key is stored privately as `installed-app.jks`; private signing settings select it for local updates. `release.jks` and `eas-backup-gradle.properties` retain the different EAS key/settings. Do not switch to that EAS backup when updating the existing installation.
- Local `expo.android.versionCode` is independent of EAS remote versioning; the installer rejects a lower code and tells the user which minimum to set.
- Builds hold `builds/.apk-build.lock`, preserve caches, verify package/version/certificate, and publish atomically. After a forcibly interrupted build, remove a stale lock only after confirming no build is running.
- Installation snapshots the candidate, pulls the installed base APK into a temporary directory, checks its certificate/version, then uses only `adb install -r`. Never add automatic uninstall, data clearing, downgrade flags, or launch behavior. Temporary APK copies are cleaned up on success/failure.
- APK commands disable their own Bun dotenv loading; build subprocesses also set `EXPO_NO_DOTENV=1` and `EXPO_NO_TELEMETRY=1`. Do not add email notification to the build pipeline. The older notification script remains separate.
- Real APK compilation and update/data-retention tests require installed SDK components, the key that signed the installed app, and a connected authorized phone. Mocked Bun tests and Expo bundling alone do not establish these behaviors. `docs/android-build.md` contains the user setup guide.


- Bun is installed at `$HOME/.bun/bin/bun`; `bunx` is alongside it. Version verified during this refactor: `1.4.2`.
- Tooling shells may omit `$HOME/.bun/bin` from `PATH`. If `bun` is not found, check that location and prepend it for the command instead of assuming Bun is uninstalled or switching package managers.
- Install the locked dependencies with `bun install --frozen-lockfile`. Package downloads need network access; sandbox DNS failures may require retrying with network permission.

Commands for bash-based tooling when Bun is absent from `PATH`:

```bash
PATH="$HOME/.bun/bin:$PATH" bun install --frozen-lockfile
PATH="$HOME/.bun/bin:$PATH" bun run typecheck
PATH="$HOME/.bun/bin:$PATH" bun test
```

Android JavaScript/Hermes bundling can be verified without a device:

```bash
PATH="$HOME/.bun/bin:$PATH" EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 CI=1 bunx expo export --platform android --output-dir /tmp/grindstone-android-export
```

`EXPO_NO_DOTENV=1` keeps verification from loading local environment files. Export artifacts go outside the repository. This export verifies bundling, not an APK build or native interactions. `adb` was not available on the agent tooling shell's `PATH` during this refactor; keyboard, touch, and Android Back behavior still require a device or emulator.
