# Part 1 Notes

## What does this metric tell us about the ecosystem?

The primary metric tracks `ajv` npm downloads over the last 12 weeks. This does not measure all JSON Schema usage directly, but it provides a compact proxy for validator-level adoption activity around one widely used implementation in the JavaScript ecosystem.

The exploratory metric asks a different question: how easy is it to see explicit JSON Schema-related dependency markers in a broader filtered sample of JS/TS repositories? That does not measure ecosystem-wide adoption either, but it helps show how visible explicit downstream schema usage is from repository metadata alone.

## How would you automate this to run weekly?

The smallest approach would be a scheduled GitHub Action that runs once per week:

1. `npm run fetch:downloads`
2. `npm run fetch:proxy-rate`
3. `npm run build:dashboard`

The workflow could then commit the refreshed JSON and HTML outputs back to the repository or upload them as build artifacts.

## One challenge you faced and your solution

The main challenge was scope. It was easy to keep adding metrics and interpretations, but the qualification task only needs a small proof of concept. I solved that by treating `ajv` downloads as the clear primary metric, keeping the broader repository sampling work explicitly exploratory, and consolidating the presentation into one dashboard with the exploratory section hidden behind a toggle.
