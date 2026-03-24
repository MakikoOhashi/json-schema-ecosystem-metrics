const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const OWNER = "ajv-validator";
const REPO = "ajv";
const OUTPUT_DIR = path.join(__dirname, "..", "data");
const CHARTS_DIR = path.join(__dirname, "..", "charts");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "ajv-release-freshness.json");
const CHART_FILE = path.join(CHARTS_DIR, "ajv-release-freshness.html");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "json-schema-ecosystem-metrics",
        },
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(new Error(`GitHub API returned status ${response.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Could not parse GitHub API JSON: ${error.message}`));
          }
        });
      }
    );

    request.on("error", (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    request.setTimeout(10000, () => {
      request.destroy(new Error("Request timed out after 10 seconds"));
    });
  });
}

function wholeDaysBetween(later, earlier) {
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

function buildAnalysis(daysSinceLatestRelease) {
  let interpretation;

  if (daysSinceLatestRelease <= 60) {
    interpretation =
      "Ajv has had a recent release, which suggests active maintenance for a widely used JSON Schema implementation.";
  } else if (daysSinceLatestRelease <= 180) {
    interpretation =
      "Ajv has had a release within the last six months, which suggests maintenance is still active even if release cadence is not especially fast.";
  } else {
    interpretation =
      "Ajv has not had a very recent release, which may suggest a slower maintenance cadence for this implementation.";
  }

  return {
    interpretation,
    limitation:
      "Release timing is only a proxy. A recent release does not guarantee issue responsiveness or implementation quality, and an older release can still reflect a stable project.",
    basis: {
      comparison: "days-since-latest-release",
      maintenanceFreshnessThresholdDays: 60,
      moderateFreshnessThresholdDays: 180,
      daysSinceLatestRelease,
    },
  };
}

function buildOutput(release) {
  const publishedAt = new Date(release.published_at);
  const daysSinceLatestRelease = wholeDaysBetween(new Date(), publishedAt);

  return {
    metric: "release_freshness",
    repository: `${OWNER}/${REPO}`,
    source: {
      name: "GitHub releases API",
      url: `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
    },
    summary: {
      latestReleaseTag: release.tag_name,
      latestReleaseName: release.name || release.tag_name,
      latestReleaseDate: release.published_at,
      daysSinceLatestRelease,
      unit: "days",
    },
    analysis: buildAnalysis(daysSinceLatestRelease),
    fetchedAt: new Date().toISOString(),
  };
}

function freshnessPercent(daysSinceLatestRelease) {
  const cappedDays = Math.min(daysSinceLatestRelease, 365);
  return Math.max(8, Math.round(((365 - cappedDays) / 365) * 100));
}

function buildChartHtml(data) {
  const meterWidth = freshnessPercent(data.summary.daysSinceLatestRelease);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ajv release freshness</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #eef3f7;
      --bg-accent: #e4ebf1;
      --panel: #fbfdfe;
      --panel-strong: #f4f8fb;
      --border: #cfd8e3;
      --ink: #1f2933;
      --muted: #52606d;
      --line: #1f6f8b;
      --line-fill: rgba(31, 111, 139, 0.12);
    }

    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: linear-gradient(180deg, var(--bg), var(--bg-accent));
      color: var(--ink);
    }

    main {
      max-width: 720px;
      margin: 48px auto;
      padding: 32px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 10px 24px rgba(31, 41, 51, 0.05);
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

    .card,
    .analysis {
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel-strong);
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

    .meter {
      height: 14px;
      margin-top: 18px;
      border-radius: 999px;
      background: #dfe7ee;
      overflow: hidden;
    }

    .meter > span {
      display: block;
      width: ${meterWidth}%;
      height: 100%;
      background: linear-gradient(90deg, #1f6f8b, #4a8ea4);
    }

    .analysis {
      margin-top: 24px;
    }

    .basis-toggle {
      margin-top: 16px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: #f7fafc;
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

    code {
      font-family: "SFMono-Regular", Consolas, monospace;
    }
  </style>
</head>
<body>
  <main>
    <h1>ajv release freshness</h1>
    <p>Maintenance signal for a widely used JSON Schema validator.</p>
    <div class="summary">
      <section class="card">
        <p>Days since latest release</p>
        <p class="value">${data.summary.daysSinceLatestRelease}</p>
      </section>
      <section class="card">
        <p>Latest release tag</p>
        <p class="value">${data.summary.latestReleaseTag}</p>
      </section>
    </div>
    <p>Latest release published on ${data.summary.latestReleaseDate.slice(0, 10)}.</p>
    <div class="meter" aria-label="Release freshness meter">
      <span></span>
    </div>
    <section class="analysis">
      <h2>Short interpretation</h2>
      <p>${data.analysis.interpretation}</p>
      <p><strong>Limitation:</strong> ${data.analysis.limitation}</p>
      <details class="basis-toggle">
        <summary>Show analysis basis</summary>
        <ul class="basis-list">
          <li><strong>comparison:</strong> ${data.analysis.basis.comparison}</li>
          <li><strong>daysSinceLatestRelease:</strong> ${data.analysis.basis.daysSinceLatestRelease}</li>
          <li><strong>maintenanceFreshnessThresholdDays:</strong> ${data.analysis.basis.maintenanceFreshnessThresholdDays}</li>
          <li><strong>moderateFreshnessThresholdDays:</strong> ${data.analysis.basis.moderateFreshnessThresholdDays}</li>
        </ul>
      </details>
    </section>
    <section class="analysis">
      <p><strong>Source:</strong> <code>${data.source.url}</code></p>
      <p><strong>Fetched at:</strong> ${data.fetchedAt}</p>
    </section>
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
    const release = await fetchJson(
      `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`
    );
    const output = buildOutput(release);
    await writeOutputs(output);

    console.log(`Saved JSON to ${OUTPUT_FILE}`);
    console.log(`Saved chart to ${CHART_FILE}`);
  } catch (error) {
    console.error(`Failed to fetch ${OWNER}/${REPO} release freshness: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
