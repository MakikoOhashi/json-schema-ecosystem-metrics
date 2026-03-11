# json-schema-ecosystem-metrics

Minimal Part 1 proof-of-concept for one ecosystem metric: `ajv` npm downloads trend.

## What this does

The script fetches a small time series of `ajv` downloads from the npm downloads API, writes a structured JSON file, and generates a lightweight HTML chart.

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

## Metric note

This metric is a rough signal of package adoption and usage activity around `ajv`, which is one of the widely used JSON Schema validators. It does not measure the whole ecosystem, but it gives a simple trend view for one important tool inside it.

## Weekly automation idea

For a weekly run, the smallest setup is a scheduled GitHub Action or a cron job that runs `node src/fetch-ajv-downloads.js` once per week and commits or uploads the refreshed JSON and chart artifacts.

## API choice

This implementation uses the npm downloads API endpoint:

```text
https://api.npmjs.org/downloads/range/last-84-days/ajv
```

That keeps the proof of concept minimal while producing a meaningful time series for visualization.

## Limitations

- npm downloads are a proxy signal, not direct real-world usage.
- Download counts can include CI, mirrors, and automated installs.
- One package does not represent the entire JSON Schema ecosystem.
