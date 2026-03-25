# json-schema-ecosystem-metrics

Minimal Part 1 proof-of-concept for practical JSON Schema ecosystem signals.

## What this does

This repository is being used for the GSoC observability qualification task. The primary Part 1 metric is `ajv` npm downloads, used as a validator-level adoption proxy. A second, clearly exploratory metric is included behind a toggle in the dashboard.

The repository generates structured JSON output and a single main HTML report.

The primary downloads implementation fetches a daily series covering the last 12 weeks, then adds a short auto-generated interpretation and a limitation note.

## Start Here

If you only open one file, open:

- `charts/observability-dashboard.html`

That dashboard is the main deliverable view for this proof of concept. It is designed so that the primary metric is visible first and the exploratory metric stays hidden until expanded.

## Run instructions

Requirements:
- Node.js 18+ recommended

Run:

```bash
npm run fetch:downloads
npm run fetch:proxy-rate
npm run build:dashboard
```

Or generate everything in one go:

```bash
npm run fetch:all
```

Current outputs:
- `data/primary-validator-adoption.json`
- `data/exploratory-downstream-usage.json`
- `charts/observability-dashboard.html`
- `docs/part1-notes.md`

The main report is `charts/observability-dashboard.html`. The JSON files are internal inputs to that dashboard, and the required Part 1 written answers are in `docs/part1-notes.md`.

## Output structure

Each JSON output includes:

- metric metadata
- source URL used for the fetch
- a `summary` section with the primary metric values
- a `series.values` array when the metric has history to show
- an `analysis` section with a generated interpretation, limitation, and basis
- a `fetchedAt` timestamp

The JSON artifacts are supporting inputs, but the main dashboard is the intended single-page entry point.

## Metric strategy

This proof of concept is intentionally oriented toward one clear primary signal and one exploratory extension:

- primary: is a major JSON Schema implementation actually being used?
- exploratory: how does the same `*.schema.json` file probe look across a broad filtered JS/TS cohort versus a narrower API/config/validation-oriented cohort?

The primary metric is a rough proxy for package adoption and usage activity around `ajv`, one of the widely used JSON Schema validators. It does not measure the full ecosystem, but it gives a compact trend view for one important tool within it.

The second metric is exploratory only. It uses GitHub search to collect candidate JavaScript and TypeScript repositories, filters out forks, archived repositories, tiny low-signal repos, and obvious demo-like repos, confirms that `package.json` exists, and then compares two cohorts using the same `*.schema.json` file probe:

- a broad filtered JS/TS cohort
- a narrower API/config/validation-oriented cohort based on repository names, descriptions, or topics

The exploratory probe then scans repository trees for `*.schema.json` files.

## Interpretation layer

To make the output closer to an analysis pipeline instead of raw reporting, the script also generates:

- a short interpretation sentence based on the change between the first 7-day average and the last 7-day average
- a limitation sentence explaining why npm downloads should be treated as a proxy signal

This keeps the analysis lightweight and explicit without changing the data source or expanding the project scope.

## API choice

The downloads script builds a date-based npm downloads API URL for the last 12 weeks, in this shape:

```text
https://api.npmjs.org/downloads/range/YYYY-MM-DD:YYYY-MM-DD/ajv
```

That keeps the proof of concept minimal while still producing a meaningful time series for visualization.

The downloads metric uses the npm downloads API for `ajv`. The proxy-rate metric uses GitHub search plus raw `package.json` files from GitHub.

## Limitations

- npm downloads are a proxy signal, not direct real-world usage.
- The exploratory cohort comparison depends on GitHub search coverage, filtered repository cohorts, and the use of `*.schema.json` files as a probe, so it is not a complete measure of all JSON Schema adoption.
- Download counts can include CI, mirrors, and automated installs.
- One package does not represent the entire JSON Schema ecosystem.
- The generated artifacts are point-in-time snapshots, so values change when the script is run again.
