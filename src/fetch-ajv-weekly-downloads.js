const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const PACKAGE_NAME = "ajv";
const API_URL = `https://api.npmjs.org/downloads/point/last-week/${PACKAGE_NAME}`;
const OUTPUT_DIR = path.join(__dirname, "..", "output");
const CHARTS_DIR = path.join(__dirname, "..", "charts");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "ajv-weekly-downloads.json");
const CHART_FILE = path.join(CHARTS_DIR, "ajv-weekly-downloads.html");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });

      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`npm downloads API returned status ${response.statusCode}`)
          );
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Could not parse API response JSON: ${error.message}`));
        }
      });
    });

    request.on("error", (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    request.setTimeout(10000, () => {
      request.destroy(new Error("Request timed out after 10 seconds"));
    });
  });
}

function validateMetric(payload) {
  if (
    !payload ||
    payload.package !== PACKAGE_NAME ||
    typeof payload.downloads !== "number" ||
    typeof payload.start !== "string" ||
    typeof payload.end !== "string"
  ) {
    throw new Error("API response did not include the expected weekly downloads fields");
  }
}

function buildOutput(payload) {
  return {
    metric: "npm_weekly_downloads",
    package: payload.package,
    source: {
      name: "npm downloads API",
      url: API_URL,
    },
    period: {
      start: payload.start,
      end: payload.end,
      label: "last-week",
    },
    value: {
      downloads: payload.downloads,
      unit: "downloads",
    },
    fetchedAt: new Date().toISOString(),
  };
}

function buildChartHtml(data) {
  const maxValue = Math.max(data.value.downloads, 1);
  const width = Math.max(24, Math.round((data.value.downloads / maxValue) * 520));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ajv npm weekly downloads</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5efe3;
      --panel: #fffaf0;
      --ink: #1f2933;
      --muted: #52606d;
      --bar: #1f7a8c;
      --bar-bg: #d9e2ec;
    }

    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: linear-gradient(180deg, var(--bg), #efe6d3);
      color: var(--ink);
    }

    main {
      max-width: 720px;
      margin: 48px auto;
      padding: 32px;
      background: var(--panel);
      border: 1px solid #d9cdb8;
      border-radius: 16px;
      box-shadow: 0 18px 40px rgba(31, 41, 51, 0.08);
    }

    h1 {
      margin-top: 0;
      font-size: 2rem;
    }

    p {
      color: var(--muted);
      line-height: 1.5;
    }

    .value {
      margin: 24px 0 8px;
      font-size: 3rem;
      font-weight: 700;
    }

    .bar-shell {
      margin-top: 16px;
      background: var(--bar-bg);
      border-radius: 999px;
      overflow: hidden;
      height: 28px;
    }

    .bar {
      width: ${width}px;
      max-width: 100%;
      height: 100%;
      background: linear-gradient(90deg, var(--bar), #3ba99c);
    }

    .meta {
      margin-top: 24px;
      font-size: 0.95rem;
    }

    code {
      font-family: "SFMono-Regular", Consolas, monospace;
    }
  </style>
</head>
<body>
  <main>
    <h1>ajv npm weekly downloads</h1>
    <p>Single-metric proof of concept for package adoption activity in the JSON Schema ecosystem.</p>
    <div class="value">${data.value.downloads.toLocaleString()}</div>
    <p>Downloads recorded for ${data.period.start} through ${data.period.end}.</p>
    <div class="bar-shell" aria-label="Weekly downloads bar chart">
      <div class="bar"></div>
    </div>
    <div class="meta">
      <p><strong>Source:</strong> <code>${data.source.url}</code></p>
      <p><strong>Fetched at:</strong> ${data.fetchedAt}</p>
    </div>
  </main>
</body>
</html>`;
}

async function writeOutputs(data) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(CHARTS_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.writeFile(CHART_FILE, buildChartHtml(data), "utf8");
}

async function main() {
  try {
    const payload = await fetchJson(API_URL);
    validateMetric(payload);

    const output = buildOutput(payload);
    await writeOutputs(output);

    console.log(`Saved JSON to ${OUTPUT_FILE}`);
    console.log(`Saved chart to ${CHART_FILE}`);
  } catch (error) {
    console.error(`Failed to fetch ${PACKAGE_NAME} weekly downloads: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
