# Regression Baseline (S0)

## Purpose

This folder contains baseline regression automation for the Vue editor, used as a behavior reference before/during React migration.

## Cases

- `S0-create-project-success`
- `S0-complex-edit-save-success`

## Commands

- Dry run (list selected cases and script paths):

```bash
pnpm run regression:baseline:dry
```

- Run all baseline cases:

```bash
pnpm run regression:baseline
```

- Run a single case:

```bash
node tests/regression/run-baseline.mjs --case S0-create-project-success
```

## Environment Variables

- `APP_URL` (default: `https://localhost:8090/#/`)
- `CHROME_PATH` (default: `C:/Program Files/Google/Chrome/Application/chrome.exe`)
- `PW_OUTPUT_DIR` is assigned by the regression runner per case output directory.

## Prerequisites

- `playwright` package must be resolvable by the case scripts.
- Chromium browser runtime should be installed:

```bash
npx playwright install chromium
```

- The target app should be running and reachable by `APP_URL`.

## Output

Results are written to:

- `tests/regression/results/<timestamp>/<case-id>/...`
- `tests/regression/results/<timestamp>/summary.json`

`summary.json` includes pass/fail, failure diagnostics, and output locations for each case.
