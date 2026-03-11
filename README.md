# json-schema-ecosystem-metrics

Minimal Part 1 proof-of-concept for one ecosystem metric: `ajv` npm downloads trend.

## What this does

The repository collects one simple signal from the npm downloads API for the `ajv` package and turns it into two artifacts:

- a structured JSON snapshot
- a lightweight HTML chart

The current implementation fetches a daily downloads series covering the last 12 weeks. The output filenames still use `weekly`, but the data points themselves are daily.

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
- a `fetchedAt` timestamp

The chart renders the same daily series directly in the browser using Chart.js from a CDN.

## Metric note

This metric is a rough proxy for package adoption and usage activity around `ajv`, one of the widely used JSON Schema validators. It does not measure the full ecosystem, but it gives a compact trend view for one important tool within it.

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
