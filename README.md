# json-schema-ecosystem-metrics

Minimal Part 1 proof-of-concept for practical JSON Schema ecosystem signals.

## What this does

This repository is being used for the GSoC observability qualification task. The current direction is to focus on small but decision-useful signals rather than repository counts alone.

The proof of concept is organized around three metric types:

- adoption signal: `ajv` npm downloads trend
- maintenance signal: release freshness for a widely used JSON Schema tool
- broader adoption proxy: schema usage proxy rate across a curated JSON-using sample
- experimental removal signal: counting repositories in a curated sample where a sustained JSON Schema-related marker later disappears

The repository currently generates structured output and a lightweight HTML report for all three metric types.

For each metric, the goal is to produce:

- a structured JSON snapshot
- a lightweight HTML chart

The current downloads implementation fetches a daily series covering the last 12 weeks, then adds a short auto-generated interpretation and a limitation note. The output filenames still use `weekly`, but the data points themselves are daily.

## Run instructions

Requirements:
- Node.js 18+ recommended

Run:

```bash
npm run fetch:downloads
npm run fetch:release
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
- `data/ajv-release-freshness.json`
- `charts/ajv-release-freshness.html`
- `data/experimental-ajv-removal-signal.json`
- `charts/experimental-ajv-removal-signal.html`
- `data/schema-usage-proxy-rate.json`
- `charts/schema-usage-proxy-rate.html`
- `charts/observability-dashboard.html`

To view a single combined report, open `charts/observability-dashboard.html` in a browser.

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
- maintenance: does it still look actively maintained?
- broader adoption: how often do explicit JSON Schema-related markers appear in a wider JSON-using sample?
- removal risk: are there signs that previously sustained JSON Schema usage markers disappear from a project?

The first metric is a rough proxy for package adoption and usage activity around `ajv`, one of the widely used JSON Schema validators. It does not measure the full ecosystem, but it gives a compact trend view for one important tool within it.

The second metric looks at release freshness for `ajv-validator/ajv`, which is a practical proxy for ongoing maintenance.

The third metric is a broader adoption proxy. It scans a curated sample of JSON-using JavaScript and TypeScript repositories and checks for explicit JSON Schema-related dependency markers in `package.json`.

The fourth metric is intentionally experimental. It currently scans recent `package.json` history for the downstream repository `webpack/schema-utils` and checks whether the `ajv` dependency disappears after sustained prior presence. It does not prove migration away from JSON Schema, but it can highlight repositories where sustained JSON Schema-related markers later disappear.

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

The maintenance, proxy-rate, and removal metrics use GitHub repository metadata, release data, repository trees, and commit history.

## Limitations

- npm downloads are a proxy signal, not direct real-world usage.
- Release freshness is also only a proxy; recent releases do not automatically mean strong maintenance quality.
- The schema usage proxy rate depends on a curated repository sample and explicit markers, so it is not a complete measure of all JSON Schema adoption.
- The experimental removal signal is intentionally narrow. It currently inspects only one dependency marker across a curated repository sample and does not automatically prove full migration away from JSON Schema.
- Download counts can include CI, mirrors, and automated installs.
- One package does not represent the entire JSON Schema ecosystem.
- The generated artifacts are point-in-time snapshots, so values change when the script is run again.
