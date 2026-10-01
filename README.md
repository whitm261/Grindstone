# Grindstone

Grindstone is a local-first strength training tracker for Android. It is built for lifters who want to log workouts quickly, reuse workout structures, and review progress without creating an account or sending training data to a server.

## What You Can Do

- Build your own exercise library with notes and cues.
- Create workout templates so repeat sessions are fast to start.
- Run empty workouts when you want to train without a preset plan.
- Track sets, reps, and weight during a live session.
- Keep unfinished workout inputs saved locally, including partially typed numbers.
- Review completed workouts in history.
- Follow multi-week training blocks with mesocycles.
- Build mesocycles with ordered workouts, duplicate existing workouts, and shape split-based plans faster.
- Compare each workout's heaviest completed weight and its reps, including bodyweight sessions.
- Archive and restore exercises while retaining their history and existing programs.
- Choose from multiple built-in app themes.

## Why Use It

- **Fast logging**: the workout screen is designed for in-gym use, with large controls and minimal friction.
- **Flexible planning**: use templates for repeatable sessions or build workouts on the fly.
- **Private by default**: your training data stays on your device.
- **No account required**: there is no sign-in, sync setup, or cloud dependency.

## Getting Started

If you want to run the app locally:

```bash
bun install
bun run start
bun run android
```

## Logging and Reviewing Workouts

Reps and weight stay editable while you train. Check off the sets you performed; the app validates checked sets when you choose **Finish**. Reps must be positive whole numbers, and weight can be zero for bodyweight or no added weight. Finishing confirms how many unchecked sets will be skipped and removed. A workout with no checked sets requires confirmation too.

Workout drafts are saved on your device as you edit, so collapsing an exercise or reopening a session retains unfinished input. You can check sets or add more sets and exercises directly after typing. If local saving fails, the screen offers a retry.

Exercise progress defaults to **Heaviest weight**, with the selected set's reps and workout details. Tied weights use the set with the most reps. Only checked sets from finished workouts count; repeated exercise blocks are combined. **Volume** remains available as a separate workload measure: the sum of reps × weight.

Archive an exercise from its detail screen or by long-pressing it in the library. Archived exercises leave the usual library and pickers while retaining their history and existing program entries. Open **Archived** to view or restore them.

## Running Training Blocks

Starting a mesocycle saves the program for that active block. Editing its reusable definition does not change an already started block. Each workout is tracked by its position in the block and week, so duplicate workout names remain distinct. Starting the same workout again resumes its existing session; finished workouts open their history entry.

Plans used by running or completed training blocks cannot be deleted, preserving those blocks and their workout links. Unused plans can still be deleted.

## Privacy

Grindstone stores workout data locally on your device. It does not require an account, and it does not send your training history to an external service.

## Current Highlights

- Exercise library with custom notes
- Workout templates with default sets
- Active workout logging with local drafts and validation on finish
- Workout history and heaviest-weight progress charts with reps
- Exercise archival and restoration
- Mesocycle planning with stable active programs and resumable sessions
- Built-in theme selection in Settings
