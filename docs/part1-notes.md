# Part 1 Notes

## What does this metric tell us about the ecosystem?

The primary metric tracks `ajv` npm downloads over the last 12 weeks. This does not measure all JSON Schema usage directly, but it provides a compact proxy for validator-level adoption activity around one widely used implementation in the JavaScript ecosystem.

The exploratory metric asks a different question: how easy is it to see explicit JSON Schema signals inside a JS/TS-facing repository sample? That still does not measure ecosystem-wide adoption directly, but it helps test how a future adoption ratio might be defined.

The stronger long-term version of that question would be:

- denominator: repositories that visibly use JSON-bearing files
- numerator: repositories that show explicit JSON Schema signals

In other words, the future goal is closer to `JSON Schema usage / JSON usage`, not just one isolated marker.

## How would you automate this to run weekly?

The smallest approach would be a scheduled GitHub Action that runs once per week:

1. `npm run fetch:downloads`
2. `npm run fetch:proxy-rate`
3. `npm run build:dashboard`

The workflow could then commit the refreshed JSON and HTML outputs back to the repository or upload them as build artifacts.

## One challenge you faced and your solution

The main challenge was scope. It was easy to keep adding metrics and interpretations, but the qualification task only needs a small proof of concept. I solved that by treating `ajv` downloads as the clear primary metric, keeping the broader repository sampling work explicitly exploratory, and consolidating the presentation into one dashboard with the exploratory section presented as future-facing signal design rather than a firm ecosystem claim.
