# MovingWeight

Android-focused strength-training tracker built with **Expo (SDK 54)**, **React Native**, and **TypeScript**. Exercises, reusable workout templates, live session logging (sets, reps, weight), and progress charts are stored **locally** in **SQLite** via **Drizzle ORM**.

## Requirements

- [Bun](https://bun.sh) (package manager and scripts)
- Android Studio / device or emulator for `android`

## Scripts

```bash
bun install
bun run start          # Expo dev server
bun run android        # Open on Android
bun run typecheck      # Typecheck
bun apk                # Build APK locally
```

## Features

- **Exercise library** — reusable movements with optional notes.
- **Workout templates** — ordered exercises with default sets (reps/weight); **Start** copies into an active session without changing the template.
- **Mesocycles** — 8-12 week training blocks with week-to-week progression. Supports SBD (Squat, Bench, Deadlift) focus with percentage-based 1RM progression and dynamic accessories.
- **Empty workout** — add exercises and sets on the fly (same session model).
- **In-workout screen** — large controls, debounced saves, set completion with haptics and motion, reorder/remove exercises, collapse blocks.
- **History** — completed sessions with read-only detail.
- **Themes & settings** — built-in app themes with on-device persistence and a dedicated settings screen for appearance selection.
- **Progress** — per-exercise line charts (session volume and max weight) using `react-native-gifted-charts`, styled to match the active theme.

## Project layout


| Path                           | Role                                               |
| ------------------------------ | -------------------------------------------------- |
| `constants/theme.ts`           | Built-in theme definitions and shared design tokens |
| `constants/navigationTheme.ts` | React Navigation theme mapping                     |
| `db/schema.ts`                 | Drizzle table definitions                          |
| `db/init.ts`                   | SQLite DDL + `PRAGMA user_version` migrations      |
| `db/client.ts`                 | `openDatabaseSync`, FK enforcement, Drizzle client |
| `lib/queries.ts`               | Data access and chart aggregates                   |
| `app/(tabs)/`                  | Home, Exercises, Templates, Blocks (Mesocycles), History |
| `app/workout/[id].tsx`         | Active session logging                             |
| `app/session/[id].tsx`         | Completed session detail                           |
| `app/template/`                | Create/edit templates                              |
| `app/mesocycle/`               | Create/edit mesocycles and active blocks           |
| `app/exercise/`                | Create/edit exercises + charts                     |


## Security & privacy

All data stays on-device in the app SQLite file. No accounts or network sync are implemented.

## Agent notes

See [AGENTS.md](./AGENTS.md) for tooling preferences (Bun, documentation expectations).
