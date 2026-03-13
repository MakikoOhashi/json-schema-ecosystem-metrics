const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const PACKAGE_NAME = "ajv";
const WEEKS = 12;
const OUTPUT_DIR = path.join(__dirname, "..", "data");
const CHARTS_DIR = path.join(__dirname, "..", "charts");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "ajv-weekly-downloads.json");
const CHART_FILE = path.join(CHARTS_DIR, "ajv-weekly-downloads.html");

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildApiUrl() {
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 1);

  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - ((WEEKS * 7) - 1));

  return `https://api.npmjs.org/downloads/range/${formatDate(startDate)}:${formatDate(endDate)}/${PACKAGE_NAME}`;
}

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
    !Array.isArray(payload.downloads) ||
    payload.downloads.length === 0
  ) {
    throw new Error("API response did not include the expected downloads series");
  }

  for (const point of payload.downloads) {
    if (
      !point ||
      typeof point.day !== "string" ||
      typeof point.downloads !== "number"
    ) {
      throw new Error("API response included an invalid downloads point");
    }
  }
}

function averageDownloads(points) {
  const total = points.reduce((sum, point) => sum + point.downloads, 0);
  return total / points.length;
}

function roundPercent(value) {
  return Math.round(value * 10) / 10;
}

function buildAnalysis(downloads) {
  const windowSize = Math.min(7, downloads.length);
  const startingWindow = downloads.slice(0, windowSize);
  const endingWindow = downloads.slice(-windowSize);
  const startingAverage = averageDownloads(startingWindow);
  const endingAverage = averageDownloads(endingWindow);
  const rawChangePercent = ((endingAverage - startingAverage) / startingAverage) * 100;
  const changePercent = roundPercent(rawChangePercent);

  let direction = "remained roughly flat";
  if (changePercent > 3) {
    direction = "increased";
  } else if (changePercent < -3) {
    direction = "decreased";
  }

  const interpretation =
    direction === "remained roughly flat"
      ? `Ajv downloads remained roughly flat over the last ${WEEKS} weeks. This suggests steady usage of JSON Schema validation within the JavaScript ecosystem.`
      : `Ajv downloads ${direction} ${Math.abs(changePercent)}% over the last ${WEEKS} weeks. This suggests ${direction === "increased" ? "continued adoption" : "softening activity"} for JSON Schema validation within the JavaScript ecosystem.`;

  return {
    interpretation,
    limitation:
      "This is a proxy metric based on npm downloads, so it can include CI traffic, automated installs, and other non-human activity.",
    basis: {
      comparison: "first-7-days-vs-last-7-days-average",
      startingAverageDownloads: Math.round(startingAverage),
      endingAverageDownloads: Math.round(endingAverage),
      changePercent,
    },
  };
}

function buildOutput(payload, apiUrl) {
  const downloads = payload.downloads.map((point) => ({
    day: point.day,
    downloads: point.downloads,
  }));
  const totalDownloads = downloads.reduce((sum, point) => sum + point.downloads, 0);
  const analysis = buildAnalysis(downloads);

  return {
    metric: "npm_downloads_trend",
    package: payload.package,
    source: {
      name: "npm downloads API",
      url: apiUrl,
    },
    period: {
      start: payload.start,
      end: payload.end,
      label: `last-${WEEKS}-weeks`,
    },
    summary: {
      points: downloads.length,
      totalDownloads,
      unit: "downloads",
    },
    series: {
      interval: "day",
      unit: "downloads",
      values: downloads,
    },
    analysis,
    fetchedAt: new Date().toISOString(),
  };
}

function buildChartHtml(data) {
  const labels = data.series.values.map((point) => point.day);
  const values = data.series.values.map((point) => point.downloads);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ajv npm downloads trend</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5efe3;
      --panel: #fffaf0;
      --ink: #1f2933;
      --muted: #52606d;
      --line: #1f7a8c;
      --line-fill: rgba(31, 122, 140, 0.16);
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

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin: 24px 0;
    }

    .card {
      padding: 16px;
      border: 1px solid #d9cdb8;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.6);
    }

    p {
      color: var(--muted);
      line-height: 1.5;
    }

    .value {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
      color: var(--ink);
    }

    .meta {
      margin-top: 24px;
      font-size: 0.95rem;
    }

    .chart-wrap {
      margin-top: 20px;
      height: 320px;
    }

    .analysis {
      margin-top: 24px;
      padding: 18px;
      border: 1px solid #d9cdb8;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.72);
    }

    .analysis h2 {
      margin: 0 0 12px;
      font-size: 1.1rem;
    }

    .analysis p {
      margin: 0 0 10px;
    }

    .analysis p:last-child {
      margin-bottom: 0;
    }

    .basis-toggle {
      margin-top: 16px;
      border: 1px solid #d9cdb8;
      border-radius: 10px;
      background: rgba(245, 239, 227, 0.55);
      padding: 12px 14px;
    }

    .basis-toggle summary {
      cursor: pointer;
      font-weight: 700;
      color: var(--ink);
    }

    .basis-list {
      margin: 12px 0 8px;
      padding-left: 18px;
      color: var(--muted);
    }

    .basis-note {
      margin-top: 8px;
      font-size: 0.95rem;
    }

    code {
      font-family: "SFMono-Regular", Consolas, monospace;
    }
  </style>
</head>
<body>
  <main>
    <h1>ajv npm downloads trend</h1>
    <p>Single-metric proof of concept for package adoption activity in the JSON Schema ecosystem.</p>
    <div class="summary">
      <section class="card">
        <p>Total downloads (last 12 weeks)</p>
        <p class="value">${data.summary.totalDownloads.toLocaleString()}</p>
      </section>
      <section class="card">
        <p>Time range</p>
        <p class="value">${data.period.label}</p>
      </section>
    </div>
    <p>Daily downloads recorded for ${data.period.start} through ${data.period.end}.</p>
    <div class="chart-wrap">
      <canvas id="downloadsChart" aria-label="Downloads trend chart"></canvas>
    </div>
    <section class="analysis">
      <h2>Short interpretation</h2>
      <p>${data.analysis.interpretation}</p>
      <p><strong>Limitation:</strong> ${data.analysis.limitation}</p>
      <details class="basis-toggle">
        <summary>Show analysis basis</summary>
        <ul class="basis-list">
          <li><strong>comparison:</strong> ${data.analysis.basis.comparison}</li>
          <li><strong>startingAverageDownloads:</strong> ${data.analysis.basis.startingAverageDownloads.toLocaleString()}</li>
          <li><strong>endingAverageDownloads:</strong> ${data.analysis.basis.endingAverageDownloads.toLocaleString()}</li>
          <li><strong>changePercent:</strong> ${data.analysis.basis.changePercent}%</li>
        </ul>
        <p class="basis-note">Raw JSON available in <code>data/ajv-weekly-downloads.json</code>.</p>
      </details>
    </section>
    <div class="meta">
      <p><strong>Source:</strong> <code>${data.source.url}</code></p>
      <p><strong>Fetched at:</strong> ${data.fetchedAt}</p>
    </div>
  </main>
  <script>
    const labels = ${JSON.stringify(labels)};
    const values = ${JSON.stringify(values)};

    new Chart(document.getElementById("downloadsChart"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Daily downloads",
          data: values,
          borderColor: "#1f7a8c",
          backgroundColor: "rgba(31, 122, 140, 0.16)",
          borderWidth: 2,
          tension: 0.25,
          fill: true,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 8
            }
          },
          y: {
            beginAtZero: true
          }
        }
      }
    });
  </script>
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
    const apiUrl = buildApiUrl();
    const payload = await fetchJson(apiUrl);
    validateMetric(payload);

    const output = buildOutput(payload, apiUrl);
    await writeOutputs(output);

    console.log(`Saved JSON to ${OUTPUT_FILE}`);
    console.log(`Saved chart to ${CHART_FILE}`);
  } catch (error) {
    console.error(`Failed to fetch ${PACKAGE_NAME} weekly downloads: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
