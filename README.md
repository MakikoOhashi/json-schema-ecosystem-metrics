# json-schema-ecosystem-metrics

Minimal Part 1 proof-of-concept for practical JSON Schema ecosystem signals, focused on a JavaScript/TypeScript-facing slice rather than the full multi-language ecosystem.

## What This Repo Contains

This repository is being used for the GSoC observability qualification task.

- The primary Part 1 metric is `ajv` npm downloads, used as a validator-level adoption proxy.
- A second metric is exploratory only. It compares repository cohorts inside a JavaScript/TypeScript-facing slice of the ecosystem.
- The outputs are structured JSON files, a single main HTML dashboard, and short written notes for Part 1.

The primary downloads implementation fetches a daily series covering the last 12 weeks, then derives a 7-day rolling average and weekly totals so the main trend is easier to read.

## Start Here

If you only open one file, open:

- `charts/observability-dashboard.html`

That dashboard is the main deliverable view for this proof of concept. It is designed to read in three steps: time/change first, cohort comparison second, and cautious summary last.

## Run

Requirements:
- Node.js 18+ recommended

Run:

```bash
npm run fetch:downloads
npm run prepare:probe-sample
npm run fetch:proxy-rate
npm run build:dashboard
```

If the GitHub-based exploratory probe hits rate limits, try the smaller batch:

```bash
npm run fetch:proxy-rate:small
npm run build:dashboard
```

Or the smallest retry path:

```bash
npm run fetch:proxy-rate:tiny
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

## Dashboard structure

The dashboard is organized in three layers:

1. `Primary Metric`
   This is the vertical view. It asks how one important validator signal is changing over time.
2. `Exploratory Metric`
   This is the horizontal view. It asks which cohort definition makes explicit JSON Schema usage easier or harder to see.
3. `Support Signals`
   This is a light summary layer. It combines the first two sections into cautious decision hints and a future-direction note about scope.

## Metric strategy

This proof of concept is intentionally oriented toward one clear primary signal and one exploratory extension:

- primary: how is one major JSON Schema implementation moving over time?
- exploratory: how does the same `*.schema.json` file probe look across a broad filtered JS/TS cohort versus a narrower API/config/validation-oriented cohort?

The primary metric is a rough proxy for package adoption and usage activity around `ajv`, one of the widely used JSON Schema validators. It does not measure the full ecosystem, but it gives a compact trend view for one important tool within it.

The second metric is exploratory only. It uses GitHub search to collect candidate JavaScript and TypeScript repositories, filters out forks, archived repositories, tiny low-signal repos, and obvious demo-like repos, confirms that `package.json` exists, and then compares two cohorts using the same `*.schema.json` file probe:

- a broad filtered JS/TS cohort
- a narrower API/config/validation-oriented cohort based on repository names, descriptions, or topics

The exploratory probe then scans repository trees for `*.schema.json` files.

This exploratory comparison is still only a JS/TS-facing slice. It does not measure the full JSON Schema ecosystem across other implementation languages.

The longer-term target would be closer to a true adoption ratio:

- denominator: repositories that visibly use JSON-bearing files
- numerator: repositories that show explicit JSON Schema signals

This proof of concept does not reach that full ratio yet. It mainly explores how to define those two sets in a way that is observable and repeatable.

## API choice

The downloads script builds a date-based npm downloads API URL for the last 12 weeks, in this shape:

```text
https://api.npmjs.org/downloads/range/YYYY-MM-DD:YYYY-MM-DD/ajv
```

That keeps the proof of concept minimal while still producing a meaningful time series for visualization.

The downloads metric uses the npm downloads API for `ajv`. The exploratory repository work uses GitHub search and repository-tree APIs.

## Staged exploratory path

The exploratory work is the part most likely to hit GitHub rate limits. The safer staged path is:

```bash
npm run prepare:probe-sample
```

This creates `data/schema-probe-sample.json`, which fixes a reproducible 50-repository broad sample before heavier file-tree probing runs.

The current preparation step:

- filters to active JS/TS repositories
- excludes forks, archived repos, tiny repos, and obvious demo-like repos
- splits the eligible set into `high / mid / low` star bands
- samples across those three star bands with a fixed seed

Additional exploratory probe scripts are also kept in the repository as experiments, but they are not the main Part 1 deliverable.

## Limitations

- npm downloads are a proxy signal, not direct real-world usage.
- The exploratory cohort comparison depends on GitHub search coverage, filtered repository cohorts, and the use of `*.schema.json` files as a probe, so it is not a complete measure of all JSON Schema adoption.
- This proof of concept currently measures a JavaScript/TypeScript-facing slice of the ecosystem, not the full multi-language JSON Schema ecosystem.
- Download counts can include CI, mirrors, and automated installs.
- One package does not represent the entire JSON Schema ecosystem.
- The generated artifacts are point-in-time snapshots, so values change when the script is run again.

## Future direction

The clearest next step is to move from single-signal probes toward a more explicit adoption ratio:

- denominator: repositories that visibly use JSON-bearing files such as `.json`, `.jsonc`, OpenAPI files, or config JSON
- numerator: repositories that show explicit JSON Schema signals such as `"$schema"`, `json-schema.org` URLs, `*.schema.json`, `schemas/` paths, or validator dependencies

That would get closer to measuring `JSON Schema usage / JSON usage`, which is a stronger ecosystem-adoption question than any one proxy alone.
