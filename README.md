# json-schema-ecosystem-metrics

Minimal Part 1 proof-of-concept for practical JSON Schema ecosystem signals.

## What this does

This repository is being used for the GSoC observability qualification task. The current direction is to focus on small but decision-useful signals rather than repository counts alone.

The proof of concept is organized around three metric types:

- adoption signal: `ajv` npm downloads trend
- maintenance signal: release freshness for a widely used JSON Schema tool
- experimental removal signal: detecting when a sustained JSON Schema-related marker later disappears

The repository currently generates structured output and a lightweight chart for the adoption signal, and the next step is to extend the same pattern to the other two metrics.

For each metric, the goal is to produce:

- a structured JSON snapshot
- a lightweight HTML chart

The current downloads implementation fetches a daily series covering the last 12 weeks, then adds a short auto-generated interpretation and a limitation note. The output filenames still use `weekly`, but the data points themselves are daily.

## Run instructions

Requirements:
- Node.js 18+ recommended

Run:

```bash
node src/fetch-ajv-downloads.js
```

Current outputs:
- `data/ajv-weekly-downloads.json`
- `charts/ajv-weekly-downloads.html`

To view the chart, open `charts/ajv-weekly-downloads.html` in a browser.

## Output structure

The current JSON output includes:

- metric metadata
- source URL used for the fetch
- period start and end dates
- summary totals
- a `series.values` array of daily download points
- an `analysis` section with a generated interpretation, limitation, and comparison basis
- a `fetchedAt` timestamp

The chart renders the same daily series directly in the browser using Chart.js from a CDN, displays the generated interpretation and limitation below the graph, and includes a small toggle to reveal the analysis basis used to generate the interpretation.

## Metric strategy

This proof of concept is intentionally oriented toward practical ecosystem signals:

- adoption: is a major JSON Schema implementation actually being used?
- maintenance: does it still look actively maintained?
- removal risk: are there signs that previously sustained JSON Schema usage markers disappear from a project?

The first metric is a rough proxy for package adoption and usage activity around `ajv`, one of the widely used JSON Schema validators. It does not measure the full ecosystem, but it gives a compact trend view for one important tool within it.

The second metric is intended to show maintenance freshness, which is often important for real-world adoption decisions.

The third metric is intentionally experimental. It does not prove migration away from JSON Schema, but it can highlight repositories where sustained JSON Schema-related markers later disappear.

## Interpretation layer

To make the output closer to an analysis pipeline instead of raw reporting, the script also generates:

- a short interpretation sentence based on the change between the first 7-day average and the last 7-day average
- a limitation sentence explaining why npm downloads should be treated as a proxy signal

This keeps the analysis lightweight and explicit without changing the data source or expanding the project scope.

## Weekly automation idea

For a weekly refresh, the smallest setup is a scheduled GitHub Action or a cron job that runs the metric scripts once per week and commits or uploads the refreshed JSON and chart artifacts.

## API choice

The current downloads script builds a date-based npm downloads API URL for the last 12 weeks, in this shape:

```text
https://api.npmjs.org/downloads/range/YYYY-MM-DD:YYYY-MM-DD/ajv
```

That keeps the proof of concept minimal while still producing a meaningful time series for visualization. The planned maintenance and removal metrics will likely use GitHub repository metadata and commit history instead of npm data.

## Limitations

- npm downloads are a proxy signal, not direct real-world usage.
- Release freshness is also only a proxy; recent releases do not automatically mean strong maintenance quality.
- The experimental removal signal will need careful interpretation, because disappearing markers do not automatically prove full migration away from JSON Schema.
- Download counts can include CI, mirrors, and automated installs.
- One package does not represent the entire JSON Schema ecosystem.
- The generated artifacts are point-in-time snapshots, so values change when the script is run again.
