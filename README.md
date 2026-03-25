# json-schema-ecosystem-metrics

Minimal Part 1 proof-of-concept for practical JSON Schema ecosystem signals.

## What this does

This repository is being used for the GSoC observability qualification task. The current direction is to focus on small but decision-useful signals rather than repository counts alone.

The proof of concept is organized around three metric types:

- adoption signal: `ajv` npm downloads trend
- broader adoption proxy: schema usage proxy rate across a filtered random sample of eligible JS/TS repositories
- experimental removal signal: counting repositories in a curated sample where a sustained JSON Schema-related marker later disappears

The repository currently generates structured output and a lightweight HTML report for these signals.

For each metric, the goal is to produce:

- a structured JSON snapshot
- a lightweight HTML chart

The current downloads implementation fetches a daily series covering the last 12 weeks, then adds a short auto-generated interpretation and a limitation note. The output filenames still use `weekly`, but the data points themselves are daily.

## Start Here

If you only open one file, open:

- `charts/observability-dashboard.html`

That combined dashboard is the main deliverable view for this proof of concept. The other HTML and JSON files are supporting artifacts for the individual metrics.

## Run instructions

Requirements:
- Node.js 18+ recommended

Run:

```bash
npm run fetch:downloads
npm run fetch:removal
npm run fetch:proxy-rate
npm run build:dashboard
```

Or generate everything in one go:

```bash
npm run fetch:all
```

Current outputs:
- `data/ajv-weekly-downloads.json`
- `charts/ajv-weekly-downloads.html`
- `data/experimental-ajv-removal-signal.json`
- `charts/experimental-ajv-removal-signal.html`
- `data/schema-usage-proxy-rate.json`
- `charts/schema-usage-proxy-rate.html`
- `charts/observability-dashboard.html`

The main report is `charts/observability-dashboard.html`. The metric-specific files are supporting detail views.

## Output structure

Each JSON output includes:

- metric metadata
- source URL used for the fetch
- a `summary` section with the primary metric values
- a `series.values` array when the metric has history to show
- an `analysis` section with a generated interpretation, limitation, and basis
- a `fetchedAt` timestamp

Each HTML report displays the metric summary, generated interpretation, limitation, and a toggle showing the analysis basis.

## Metric strategy

This proof of concept is intentionally oriented toward practical ecosystem signals:

- adoption: is a major JSON Schema implementation actually being used?
- broader adoption: how often do explicit JSON Schema-related markers appear in a wider JSON-using sample?
- removal risk: are there signs that previously sustained JSON Schema usage markers disappear from a project?

The first metric is a rough proxy for package adoption and usage activity around `ajv`, one of the widely used JSON Schema validators. It does not measure the full ecosystem, but it gives a compact trend view for one important tool within it.

The second metric is a broader adoption proxy. It uses GitHub search to collect candidate JavaScript and TypeScript repositories, filters out forks, archived repositories, tiny low-signal repos, and obvious demo-like repos, confirms that `package.json` exists, and then takes a seeded random sample of 50 repositories. It checks that sampled set for explicit JSON Schema-related dependency markers in `package.json`.

The third metric is intentionally experimental. It scans recent `package.json` history across the same filtered sample and counts repositories where the `ajv` dependency is absent at `HEAD` after sustained prior presence in the recent commit window. It does not prove migration away from JSON Schema, but it can highlight possible removal events.

## Interpretation layer

To make the output closer to an analysis pipeline instead of raw reporting, the script also generates:

- a short interpretation sentence based on the change between the first 7-day average and the last 7-day average
- a limitation sentence explaining why npm downloads should be treated as a proxy signal

This keeps the analysis lightweight and explicit without changing the data source or expanding the project scope.

## Weekly automation idea

For a weekly refresh, the smallest setup is a scheduled GitHub Action or a cron job that runs the metric scripts once per week and commits or uploads the refreshed JSON and HTML artifacts.

## API choice

The downloads script builds a date-based npm downloads API URL for the last 12 weeks, in this shape:

```text
https://api.npmjs.org/downloads/range/YYYY-MM-DD:YYYY-MM-DD/ajv
```

That keeps the proof of concept minimal while still producing a meaningful time series for visualization.

The downloads metric uses the npm downloads API. The proxy-rate metric uses GitHub search plus raw `package.json` files from GitHub. The experimental removal metric uses recent git history plus `package.json` checks across the filtered sample.

## Limitations

- npm downloads are a proxy signal, not direct real-world usage.
- The schema usage proxy rate depends on a filtered random sample, GitHub search coverage, and explicit dependency markers, so it is not a complete measure of all JSON Schema adoption.
- The experimental removal signal is intentionally narrow. It currently inspects only one dependency marker across a curated repository sample and does not automatically prove full migration away from JSON Schema.
- Download counts can include CI, mirrors, and automated installs.
- One package does not represent the entire JSON Schema ecosystem.
- The generated artifacts are point-in-time snapshots, so values change when the script is run again.
