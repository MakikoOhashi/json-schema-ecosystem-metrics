const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");
const CHARTS_DIR = path.join(__dirname, "..", "charts");
const OUTPUT_FILE = path.join(CHARTS_DIR, "observability-dashboard.html");

async function readJson(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function formatNumber(value) {
  return value.toLocaleString();
}

function markerStatusClass(markerPresent) {
  return markerPresent ? "status-present" : "status-absent";
}

function buildHistoryRows(history) {
  return history
    .map(
      (entry) => `<tr>
        <td><code>${entry.commitSha.slice(0, 7)}</code></td>
        <td class="${markerStatusClass(entry.markerPresent)}">${entry.markerPresent ? "present" : "absent"}</td>
      </tr>`
    )
    .join("\n");
}

function buildHtml(downloads, release, removal, proxyRate) {
  const labels = downloads.series.values.map((point) => point.day);
  const values = downloads.series.values.map((point) => point.downloads);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JSON Schema observability dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      color-scheme: light;
      --bg: #edf3f7;
      --bg-accent: #e3ebf1;
      --panel: #fbfdfe;
      --panel-strong: #f4f8fb;
      --border: #cfd8e3;
      --ink: #1f2933;
      --muted: #52606d;
      --line: #1f6f8b;
      --line-fill: rgba(31, 111, 139, 0.12);
      --present: #2e7d60;
      --absent: #8c5a3c;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: linear-gradient(180deg, var(--bg), var(--bg-accent));
      color: var(--ink);
    }

    main {
      max-width: 1080px;
      margin: 40px auto;
      padding: 28px;
    }

    .hero,
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: 0 10px 24px rgba(31, 41, 51, 0.05);
    }

    .hero {
      padding: 28px;
      margin-bottom: 20px;
    }

    h1,
    h2,
    h3 {
      color: var(--ink);
    }

    h1 {
      margin: 0 0 8px;
      font-size: 2.3rem;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 1.35rem;
    }

    p {
      color: var(--muted);
      line-height: 1.55;
    }

    .top-grid,
    .bottom-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 18px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 20px;
    }

    .summary-card,
    .mini-card {
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel-strong);
    }

    .summary-card p,
    .mini-card p {
      margin: 0 0 8px;
    }

    .value {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
      color: var(--ink);
    }

    .downloads-panel {
      grid-column: span 8;
      padding: 24px;
    }

    .signals-panel {
      grid-column: span 4;
      padding: 24px;
    }

    .history-panel {
      grid-column: span 12;
      padding: 24px;
    }

    .chart-wrap {
      height: 340px;
      margin-top: 16px;
    }

    .analysis {
      margin-top: 18px;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel-strong);
    }

    .analysis p:last-child {
      margin-bottom: 0;
    }

    .stack {
      display: grid;
      gap: 14px;
    }

    .mini-card .value {
      font-size: 1.6rem;
    }

    .basis-toggle {
      margin-top: 14px;
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
      margin: 12px 0 0;
      padding-left: 18px;
      color: var(--muted);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }

    th,
    td {
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      text-align: left;
      color: var(--muted);
    }

    .status-present {
      color: var(--present);
      font-weight: 700;
    }

    .status-absent {
      color: var(--absent);
      font-weight: 700;
    }

    code {
      font-family: "SFMono-Regular", Consolas, monospace;
    }

    .links {
      margin-top: 18px;
      font-size: 0.95rem;
    }

    .links a {
      color: var(--line);
      text-decoration: none;
      margin-right: 14px;
    }

    @media (max-width: 900px) {
      .downloads-panel,
      .signals-panel,
      .history-panel {
        grid-column: span 12;
      }

      .summary-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>JSON Schema observability dashboard</h1>
      <p>One-sheet view of practical signals: adoption, maintenance, ecosystem proxy adoption, and an experimental removal check.</p>
      <div class="summary-grid">
        <section class="summary-card">
          <p>12-week ajv downloads</p>
          <p class="value">${formatNumber(downloads.summary.totalDownloads)}</p>
        </section>
        <section class="summary-card">
          <p>Days since latest ajv release</p>
          <p class="value">${release.summary.daysSinceLatestRelease}</p>
        </section>
        <section class="summary-card">
          <p>Possible removals in sample</p>
          <p class="value">${removal.summary.repositoriesWithPossibleRemoval}</p>
        </section>
        <section class="summary-card">
          <p>Explicit schema markers in sample</p>
          <p class="value">${proxyRate.summary.repositoriesWithAnyMarker}/${proxyRate.summary.repositoriesScanned}</p>
        </section>
      </div>
      <div class="links">
        <a href="./ajv-weekly-downloads.html">Downloads detail</a>
        <a href="./ajv-release-freshness.html">Release detail</a>
        <a href="./experimental-ajv-removal-signal.html">Removal detail</a>
        <a href="./schema-usage-proxy-rate.html">Proxy rate detail</a>
      </div>
    </section>

    <section class="top-grid">
      <section class="panel downloads-panel">
        <h2>Adoption signal</h2>
        <p>Daily npm downloads for <code>${downloads.package}</code> from ${downloads.period.start} through ${downloads.period.end}.</p>
        <div class="chart-wrap">
          <canvas id="downloadsChart" aria-label="Ajv downloads trend"></canvas>
        </div>
        <section class="analysis">
          <h3>Short interpretation</h3>
          <p>${downloads.analysis.interpretation}</p>
          <p><strong>Limitation:</strong> ${downloads.analysis.limitation}</p>
          <details class="basis-toggle">
            <summary>Show analysis basis</summary>
            <ul class="basis-list">
              <li><strong>comparison:</strong> ${downloads.analysis.basis.comparison}</li>
              <li><strong>startingAverageDownloads:</strong> ${formatNumber(downloads.analysis.basis.startingAverageDownloads)}</li>
              <li><strong>endingAverageDownloads:</strong> ${formatNumber(downloads.analysis.basis.endingAverageDownloads)}</li>
              <li><strong>changePercent:</strong> ${downloads.analysis.basis.changePercent}%</li>
            </ul>
          </details>
        </section>
      </section>

      <section class="panel signals-panel">
        <h2>Cross-over view</h2>
        <div class="stack">
          <section class="mini-card">
            <p>Maintenance signal</p>
            <p class="value">${release.summary.daysSinceLatestRelease}</p>
            <p>days since latest release of <code>${release.repository}</code></p>
            <p>${release.analysis.interpretation}</p>
          </section>
          <section class="mini-card">
            <p>Schema usage proxy rate</p>
            <p class="value">${proxyRate.summary.repositoriesWithAnyMarker}/${proxyRate.summary.repositoriesScanned}</p>
            <p>${proxyRate.summary.proxyRatePercent}% of the curated sample shows at least one explicit dependency marker.</p>
            <p>${proxyRate.analysis.interpretation}</p>
          </section>
          <section class="mini-card">
            <p>Experimental removal signal</p>
            <p class="value">${removal.summary.possibleRemovalRatePercent}%</p>
            <p>${removal.summary.repositoriesWithPossibleRemoval} of ${removal.summary.repositoriesScanned} curated repositories show a possible removal under the current rule.</p>
            <p>Marker package: <code>${removal.summary.markerPackage}</code></p>
            <p>${removal.analysis.interpretation}</p>
          </section>
        </div>
      </section>
    </section>

    <section class="bottom-grid">
      <section class="panel history-panel">
        <h2>Per-repository removal check</h2>
        <p>Curated-sample result showing whether <code>${removal.summary.markerPackage}</code> looks removed after sustained recent presence.</p>
        <table>
          <thead>
            <tr>
              <th>Repository</th>
              <th>Head has marker</th>
              <th>Prior presence count</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
${removal.series.values
  .map(
    (entry) => `<tr>
              <td><code>${entry.repository}</code></td>
              <td>${entry.headHasMarker ? "yes" : "no"}</td>
              <td>${entry.priorPresenceCount}</td>
              <td>${entry.removalDetected ? "possible removal" : "none detected"}</td>
            </tr>`
  )
  .join("\n")}
          </tbody>
        </table>
        <section class="analysis">
          <h3>Basis and provenance</h3>
          <p><strong>Downloads source:</strong> <code>${downloads.source.url}</code></p>
          <p><strong>Release source:</strong> <code>${release.source.url}</code></p>
          <p><strong>Proxy rate source:</strong> <code>${proxyRate.source.url}</code></p>
          <p><strong>Removal source:</strong> <code>${removal.source.url}</code></p>
          <p><strong>Dashboard built from:</strong> local JSON artifacts in <code>data/</code></p>
        </section>
      </section>
    </section>
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
          borderColor: "#1f6f8b",
          backgroundColor: "rgba(31, 111, 139, 0.12)",
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

async function main() {
  const [downloads, release, removal, proxyRate] = await Promise.all([
    readJson("ajv-weekly-downloads.json"),
    readJson("ajv-release-freshness.json"),
    readJson("experimental-ajv-removal-signal.json"),
    readJson("schema-usage-proxy-rate.json"),
  ]);

  await fs.mkdir(CHARTS_DIR, { recursive: true });
  await fs.writeFile(
    OUTPUT_FILE,
    buildHtml(downloads, release, removal, proxyRate),
    "utf8"
  );
  console.log(`Saved dashboard to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(`Failed to build dashboard: ${error.message}`);
  process.exitCode = 1;
});
