# json-schema-ecosystem-metrics

Minimal Part 1 proof-of-concept for one ecosystem metric: `ajv` npm downloads trend.

## What this does

The repository collects one simple signal from the npm downloads API for the `ajv` package and turns it into two artifacts:

- a structured JSON snapshot
- a lightweight HTML chart

The current implementation fetches a daily downloads series covering the last 12 weeks, then adds a short auto-generated interpretation and a limitation note. The output filenames still use `weekly`, but the data points themselves are daily.

## Run instructions

Requirements:
- Node.js 18+ recommended

Run:

```bash
node src/fetch-ajv-downloads.js
```

Outputs:
- `data/ajv-weekly-downloads.json`
- `charts/ajv-weekly-downloads.html`

To view the chart, open `charts/ajv-weekly-downloads.html` in a browser.

## Output structure

The JSON output includes:

- metric metadata
- source URL used for the fetch
- period start and end dates
- summary totals
- a `series.values` array of daily download points
- an `analysis` section with a generated interpretation, limitation, and comparison basis
- a `fetchedAt` timestamp

The chart renders the same daily series directly in the browser using Chart.js from a CDN, displays the generated interpretation and limitation below the graph, and includes a small toggle to reveal the analysis basis used to generate the interpretation.

## Metric note

This metric is a rough proxy for package adoption and usage activity around `ajv`, one of the widely used JSON Schema validators. It does not measure the full ecosystem, but it gives a compact trend view for one important tool within it.

## Interpretation layer

To make the output closer to an analysis pipeline instead of raw reporting, the script also generates:

- a short interpretation sentence based on the change between the first 7-day average and the last 7-day average
- a limitation sentence explaining why npm downloads should be treated as a proxy signal

This keeps the analysis lightweight and explicit without changing the data source or expanding the project scope.

## Weekly automation idea

For a weekly refresh, the smallest setup is a scheduled GitHub Action or a cron job that runs `node src/fetch-ajv-downloads.js` once per week and commits or uploads the refreshed JSON and chart artifacts.

## API choice

The script builds a date-based npm downloads API URL for the last 12 weeks, in this shape:

```text
https://api.npmjs.org/downloads/range/YYYY-MM-DD:YYYY-MM-DD/ajv
```

That keeps the proof of concept minimal while still producing a meaningful time series for visualization.

## Limitations

- npm downloads are a proxy signal, not direct real-world usage.
- Download counts can include CI, mirrors, and automated installs.
- One package does not represent the entire JSON Schema ecosystem.
- The generated artifacts are point-in-time snapshots, so values change when the script is run again.
