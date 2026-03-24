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
  const downloadsChange = downloads.analysis.basis.changePercent;
  const broaderAdoptionThin = proxyRate.summary.repositoriesWithAnyMarker <= 2;
  const coreStrong = release.summary.daysSinceLatestRelease <= 60;
  const headline = coreStrong && broaderAdoptionThin
    ? "Strong Core, Limited Visible Adoption"
    : "Mixed Signals Across the JSON Schema Surface";
  const subhead = coreStrong && broaderAdoptionThin
    ? "Ajv appears heavily used and recently maintained, while explicit JSON Schema markers appeared in only a small share of the sampled repositories."
    : "The current indicators suggest mixed evidence across adoption, maintenance, and visible downstream usage.";
  const implication = coreStrong && broaderAdoptionThin
    ? "One possible implication is that the ecosystem may benefit less from emergency core-validator support and more from better visibility into downstream schema adoption, tooling discoverability, and support for explicit schema usage."
    : "The current mix of signals suggests that further measurement may be needed before drawing a stronger support-priority conclusion.";

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
      grid-template-columns: repeat(4, minmax(0, 1fr));
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

    .headline-card {
      margin-top: 22px;
      padding: 22px;
      border-radius: 16px;
      border: 1px solid #b7c7d4;
      background:
        radial-gradient(circle at top left, rgba(31, 111, 139, 0.14), transparent 32%),
        linear-gradient(135deg, #f7fbfd, #eef5f9);
    }

    .headline-card h2 {
      margin: 0 0 10px;
      font-size: 1.9rem;
    }

    .headline-card .implication {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid rgba(183, 199, 212, 0.8);
      font-size: 1rem;
    }

    .downloads-panel {
      grid-column: span 7;
      padding: 24px;
    }

    .signals-panel {
      grid-column: span 5;
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

    .mini-card strong {
      color: var(--ink);
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
      <p>One-sheet view of practical signals organized around a single question: where does the ecosystem look strong, and where does it still need support?</p>
      <section class="headline-card">
        <h2>${headline}</h2>
        <p>${subhead}</p>
        <p class="implication"><strong>What this suggests:</strong> ${implication}</p>
      </section>
      <div class="summary-grid">
        <section class="summary-card">
          <p>12-week ajv downloads</p>
          <p class="value">${formatNumber(downloads.summary.totalDownloads)}</p>
        </section>
        <section class="summary-card">
          <p>7-day trend shift</p>
          <p class="value">${downloadsChange}%</p>
        </section>
        <section class="summary-card">
          <p>Latest ajv release age</p>
          <p class="value">${release.summary.daysSinceLatestRelease}d</p>
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
        <h2>Core Implementation Strength</h2>
        <p>Daily npm downloads for <code>${downloads.package}</code> from ${downloads.period.start} through ${downloads.period.end}, plus a maintenance check from the latest GitHub release.</p>
        <div class="chart-wrap">
          <canvas id="downloadsChart" aria-label="Ajv downloads trend"></canvas>
        </div>
        <section class="analysis">
          <h3>What the core signals say</h3>
          <p>${downloads.analysis.interpretation}</p>
          <p><strong>Maintenance context:</strong> ${release.analysis.interpretation}</p>
          <p><strong>Limitation:</strong> ${downloads.analysis.limitation}</p>
          <details class="basis-toggle">
            <summary>Show analysis basis</summary>
            <ul class="basis-list">
              <li><strong>comparison:</strong> ${downloads.analysis.basis.comparison}</li>
              <li><strong>startingAverageDownloads:</strong> ${formatNumber(downloads.analysis.basis.startingAverageDownloads)}</li>
              <li><strong>endingAverageDownloads:</strong> ${formatNumber(downloads.analysis.basis.endingAverageDownloads)}</li>
              <li><strong>changePercent:</strong> ${downloads.analysis.basis.changePercent}%</li>
              <li><strong>daysSinceLatestRelease:</strong> ${release.summary.daysSinceLatestRelease}</li>
            </ul>
          </details>
        </section>
      </section>

      <section class="panel signals-panel">
        <h2>Support Implications</h2>
        <div class="stack">
          <section class="mini-card">
            <p>Visible downstream adoption</p>
            <p class="value">${proxyRate.summary.repositoriesWithAnyMarker}/${proxyRate.summary.repositoriesScanned}</p>
            <p><strong>Read:</strong> ${proxyRate.summary.proxyRatePercent}% of the sampled repositories exposed at least one explicit dependency marker.</p>
            <p>${proxyRate.analysis.interpretation}</p>
          </section>
          <section class="mini-card">
            <p>Maintenance risk</p>
            <p class="value">${release.summary.daysSinceLatestRelease}d</p>
            <p><strong>Read:</strong> the core validator still shows a recent release, so this does not currently look like an urgent maintenance rescue case.</p>
            <p>${release.analysis.limitation}</p>
          </section>
          <section class="mini-card">
            <p>Possible churn signal</p>
            <p class="value">${removal.summary.repositoriesWithPossibleRemoval}/${removal.summary.repositoriesScanned}</p>
            <p><strong>Read:</strong> no repositories in the sample currently show a possible removal event for the <code>${removal.summary.markerPackage}</code> marker under the current rule.</p>
            <p>${removal.analysis.limitation}</p>
          </section>
        </div>
      </section>
    </section>

    <section class="bottom-grid">
      <section class="panel history-panel">
        <h2>Evidence Snapshot</h2>
        <p>Per-repository result for the experimental removal check. This is supporting evidence, not the main claim of the page.</p>
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
          <h3>Provenance and Caveats</h3>
          <p><strong>Downloads source:</strong> <code>${downloads.source.url}</code></p>
          <p><strong>Release source:</strong> <code>${release.source.url}</code></p>
          <p><strong>Proxy rate source:</strong> <code>${proxyRate.source.url}</code></p>
          <p><strong>Removal source:</strong> <code>${removal.source.url}</code></p>
          <p><strong>Dashboard built from:</strong> local JSON artifacts in <code>data/</code></p>
          <p><strong>Big caveat:</strong> the broader-adoption and removal metrics are still proxies built from filtered samples. They are useful for directional thinking, not for ecosystem-wide claims.</p>
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
