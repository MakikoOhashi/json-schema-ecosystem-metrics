# json-schema-ecosystem-metrics

Minimal Part 1 proof-of-concept for one ecosystem metric: `ajv` npm weekly downloads.

## What this does

The script fetches `ajv` weekly downloads from the npm downloads API, writes a structured JSON file, and generates a lightweight HTML visualization.

## Run instructions

Requirements:
- Node.js 18+ recommended

Run:

```bash
node src/fetch-ajv-weekly-downloads.js
```

Outputs:
- `output/ajv-weekly-downloads.json`
- `charts/ajv-weekly-downloads.html`

To view the chart, open `charts/ajv-weekly-downloads.html` in a browser.

## Metric note

This metric is a rough signal of package adoption and usage activity around `ajv`, which is one of the widely used JSON Schema validators. It does not measure the whole ecosystem, but it gives a simple weekly pulse for one important tool inside it.

## Weekly automation idea

For a weekly run, the smallest setup is a scheduled GitHub Action or a cron job that runs `node src/fetch-ajv-weekly-downloads.js` once per week and commits or uploads the refreshed JSON and chart artifacts.

## One challenge and solution

Challenge: the proof of concept is intentionally limited to one metric, so the npm endpoint had to stay simple and return a single weekly value rather than a larger trend series.

Solution: use the npm downloads point endpoint for `last-week` and generate a very small single-value HTML bar visualization from that one response.

## API choice

This implementation uses the npm downloads API endpoint:

```text
https://api.npmjs.org/downloads/point/last-week/ajv
```

That matches the requested metric directly, so there was no need to change API choice.
