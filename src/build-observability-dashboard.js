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

function buildHtml(downloads, removal, proxyRate) {
  const labels = downloads.series.values.map((point) => point.day);
  const values = downloads.series.values.map((point) => point.downloads);
  const downloadsChange = downloads.analysis.basis.changePercent;
  const broaderAdoptionThin = proxyRate.summary.repositoriesWithAnyMarker <= 2;
  const candidateCount = proxyRate.summary.candidateReposFound;
  const eligibleCount = proxyRate.summary.eligibleReposAfterFiltering;
  const sampledCount = proxyRate.summary.repositoriesScanned;
  const markerCount = proxyRate.summary.repositoriesWithAnyMarker;
  const ajvMarkerCount = proxyRate.series.values.filter((entry) =>
    (entry.dependencyMarkers || []).includes("ajv")
  ).length;
  const eligibleShare = candidateCount ? (eligibleCount / candidateCount) * 100 : 0;
  const sampledShare = candidateCount ? (sampledCount / candidateCount) * 100 : 0;
  const markerShare = candidateCount ? (markerCount / candidateCount) * 100 : 0;
  const visibilityGap = ajvMarkerCount <= 1 && downloads.summary.totalDownloads > 1000000000;
  const headline = "Primary Metric First, Exploratory Signals Second";
  const subhead =
    "This proof of concept is centered on one main metric: Ajv npm downloads as a validator-level adoption proxy. Broader usage and removal checks are included below as exploratory follow-ons.";
  const implication =
    "The main deliverable is the Ajv adoption signal. The exploratory sections are useful context, but they should be read as supporting hypotheses rather than firm ecosystem conclusions.";

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

    .section-panel {
      padding: 24px;
      margin-bottom: 18px;
    }

    .history-panel {
      padding: 24px;
    }

    .visible-usage-layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 18px;
      align-items: start;
    }

    .rings-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 280px;
    }

    .rings {
      position: relative;
      width: 240px;
      height: 240px;
    }

    .ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ring::after {
      content: "";
      position: absolute;
      border-radius: 50%;
      background: var(--panel);
    }

    .ring-candidate {
      background: conic-gradient(var(--line) 0 100%, #dbe5ec 0 100%);
    }

    .ring-candidate::after {
      inset: 26px;
    }

    .ring-eligible {
      inset: 26px;
      background: conic-gradient(#3f7d92 0 ${eligibleShare}%, #dbe5ec 0 100%);
    }

    .ring-eligible::after {
      inset: 24px;
    }

    .ring-sampled {
      inset: 50px;
      background: conic-gradient(#7299aa 0 ${sampledShare}%, #dbe5ec 0 100%);
    }

    .ring-sampled::after {
      inset: 22px;
    }

    .ring-marker {
      inset: 72px;
      background: conic-gradient(var(--present) 0 ${markerShare}%, #dbe5ec 0 100%);
    }

    .ring-marker::after {
      inset: 20px;
    }

    .ring-core {
      position: absolute;
      inset: 92px;
      border-radius: 50%;
      background: #f7fafc;
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 8px;
      z-index: 1;
    }

    .ring-core strong {
      display: block;
      font-size: 1.25rem;
      color: var(--ink);
    }

    .ring-legend {
      display: grid;
      gap: 10px;
      margin-top: 8px;
    }

    .ring-legend-row {
      display: grid;
      grid-template-columns: 14px 1fr auto;
      gap: 10px;
      align-items: center;
      color: var(--muted);
      font-size: 0.96rem;
    }

    .swatch {
      width: 14px;
      height: 14px;
      border-radius: 50%;
    }

    .swatch-candidate { background: var(--line); }
    .swatch-eligible { background: #3f7d92; }
    .swatch-sampled { background: #7299aa; }
    .swatch-marker { background: var(--present); }

    .section-kicker {
      margin: 0 0 8px;
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--line);
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

    .section-toggle {
      margin-bottom: 18px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: 0 10px 24px rgba(31, 41, 51, 0.05);
      overflow: hidden;
    }

    .section-toggle summary {
      cursor: pointer;
      list-style: none;
      padding: 18px 24px;
      font-weight: 700;
      color: var(--ink);
      background: var(--panel);
    }

    .section-toggle summary::-webkit-details-marker {
      display: none;
    }

    .section-toggle .section-panel,
    .section-toggle .history-panel {
      margin-bottom: 0;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }

    @media (max-width: 900px) {
      .summary-grid {
        grid-template-columns: 1fr;
      }

      .visible-usage-layout {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>JSON Schema observability dashboard</h1>
      <p>One-sheet view of practical signals organized into position, trend, and support implication.</p>
      <section class="headline-card">
        <h2>${headline}</h2>
        <p>${subhead}</p>
        <p class="implication"><strong>What this suggests:</strong> ${implication}</p>
      </section>
      <div class="summary-grid">
        <section class="summary-card">
          <p>Primary metric</p>
          <p class="value">Ajv</p>
        </section>
        <section class="summary-card">
          <p>Ajv usage proxy</p>
          <p class="value">${formatNumber(downloads.summary.totalDownloads)}</p>
        </section>
        <section class="summary-card">
          <p>Exploratory downstream usage</p>
          <p class="value">${proxyRate.summary.repositoriesWithAnyMarker}/${proxyRate.summary.repositoriesScanned}</p>
        </section>
        <section class="summary-card">
          <p>Exploratory removals</p>
          <p class="value">${removal.summary.repositoriesWithPossibleRemoval}/${removal.summary.repositoriesScanned}</p>
        </section>
      </div>
    </section>

      <section class="panel section-panel">
        <p class="section-kicker">Primary Metric</p>
        <h2>Ajv Validator-Level Adoption</h2>
        <p>This is the main Part 1 metric. It tracks npm download activity for <code>ajv</code> as a practical proxy for validator-level adoption in the JavaScript ecosystem.</p>
        <div class="summary-grid">
          <section class="summary-card">
            <p>Ajv usage proxy</p>
            <p class="value">${formatNumber(downloads.summary.totalDownloads)}</p>
          </section>
          <section class="summary-card">
            <p>12-week direction</p>
            <p class="value">${downloadsChange}%</p>
          </section>
          <section class="summary-card">
            <p>Observed points</p>
            <p class="value">${downloads.summary.points}</p>
          </section>
        </div>
        <div class="chart-wrap">
          <canvas id="downloadsChart" aria-label="Ajv downloads trend"></canvas>
        </div>
        <section class="analysis">
          <h3>Position Read</h3>
          <p>${downloads.analysis.interpretation}</p>
          <p><strong>Downstream read:</strong> the current sample shows <code>ajv</code> in ${ajvMarkerCount} of ${sampledCount} sampled repositories, while any explicit schema-related marker appeared in ${markerCount} of ${sampledCount}.</p>
          <p><strong>What seems important now:</strong> validator-level activity around <code>ajv</code> still looks large, but explicit downstream schema usage is much harder to see in the sampled repositories.</p>
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

      <details class="section-toggle">
        <summary>Exploratory Metric: Downstream Visible Usage</summary>
      <section class="panel section-panel">
        <p class="section-kicker">Exploratory Metric</p>
        <h2>Downstream Visible Usage</h2>
        <p>This section is exploratory. It asks whether explicit JSON Schema-related markers are easy to see in a filtered random sample of eligible JS/TS repositories.</p>
        <div class="visible-usage-layout">
          <div class="rings-wrap">
            <div class="rings" aria-label="Concentric rings showing candidate, eligible, sampled, and marker-positive repository counts">
              <div class="ring ring-candidate"></div>
              <div class="ring ring-eligible"></div>
              <div class="ring ring-sampled"></div>
              <div class="ring ring-marker"></div>
              <div class="ring-core">
                <div>
                  <strong>${markerCount}</strong>
                  marker-positive
                </div>
              </div>
            </div>
          </div>
          <div class="stack">
            <div class="ring-legend">
              <div class="ring-legend-row">
                <span class="swatch swatch-candidate"></span>
                <span>Candidate repositories found</span>
                <strong>${candidateCount}</strong>
              </div>
              <div class="ring-legend-row">
                <span class="swatch swatch-eligible"></span>
                <span>Eligible after filtering</span>
                <strong>${eligibleCount}</strong>
              </div>
              <div class="ring-legend-row">
                <span class="swatch swatch-sampled"></span>
                <span>Repositories sampled</span>
                <strong>${sampledCount}</strong>
              </div>
              <div class="ring-legend-row">
                <span class="swatch swatch-marker"></span>
                <span>Explicit schema markers found</span>
                <strong>${markerCount}</strong>
              </div>
            </div>
          <section class="mini-card">
            <p>12-week direction</p>
            <p class="value">${downloadsChange}%</p>
            <p><strong>Read:</strong> this compares the first 7-day average with the last 7-day average in the Ajv downloads series.</p>
            <p>${downloadsChange < -3 ? "This points to a short-term softening signal in the current validator-level proxy." : "This does not currently show a strong short-term decline signal in the validator-level proxy."}</p>
          </section>
          <section class="mini-card">
            <p>Visible downstream usage</p>
            <p class="value">${proxyRate.summary.repositoriesWithAnyMarker}/${proxyRate.summary.repositoriesScanned}</p>
            <p><strong>Read:</strong> ${proxyRate.summary.proxyRatePercent}% of the sampled repositories exposed at least one explicit dependency marker.</p>
            <p>This is less a change metric than a present-tense visibility check. Right now, downstream explicit usage still looks sparse in the sampled set.</p>
          </section>
          <section class="mini-card">
            <p>Sampling frame</p>
            <p class="value">${proxyRate.summary.eligibleReposAfterFiltering}</p>
            <p><strong>Read:</strong> ${proxyRate.summary.repositoriesScanned} repositories were sampled from a filtered pool of ${proxyRate.summary.eligibleReposAfterFiltering} eligible JS/TS repositories.</p>
            <p>This section is meant to show visible downstream usage, not ecosystem-wide adoption.</p>
          </section>
          </div>
        </div>
      </section>
      </details>

      <details class="section-toggle">
        <summary>Exploratory Metric: Removal Signal and Support Hypothesis</summary>
      <section class="panel history-panel">
        <p class="section-kicker">Exploratory Metric</p>
        <h2>Removal Signal and Support Hypothesis</h2>
        <p>This section is the most tentative part of the page. It combines the current proxies into a support hypothesis and keeps the removal table as supporting evidence.</p>
        <div class="stack">
          <section class="mini-card">
            <p>What should likely be supported?</p>
            <p class="value">${visibilityGap ? "downstream" : "unclear"}</p>
            <p><strong>Read:</strong> validator-level usage looks strong, but explicit schema markers remain sparse downstream.</p>
            <p>If this pattern is real, the stronger support candidate is downstream visibility, tooling discoverability, and explicit schema usage support rather than emergency core rescue.</p>
          </section>
          <section class="mini-card">
            <p>What looks important now?</p>
            <p class="value">core usage</p>
            <p><strong>Read:</strong> Ajv remains the clearest strong signal in the current proof of concept.</p>
            <p>That makes it a useful anchor for observability, but not the whole ecosystem.</p>
          </section>
          <section class="mini-card">
            <p>What may be weakening?</p>
            <p class="value">${downloadsChange < -15 ? "watch trend" : "no sharp decline"}</p>
            <p><strong>Read:</strong> the 12-week downloads direction is the current weakening signal we have, while the removal check does not yet show widespread disappearance.</p>
            <p>This is a watch signal, not a diagnosis.</p>
          </section>
          <section class="mini-card">
            <p>Where might investment help?</p>
            <p class="value">${visibilityGap ? "mapping + downstream" : "more data"}</p>
            <p><strong>Read:</strong> investment may be more useful in ecosystem mapping, downstream usage visibility, and support for explicit schema adoption than in the core validator alone.</p>
            <p>This is the most synthetic and most tentative conclusion on the page.</p>
          </section>
          <section class="mini-card">
            <p>Possible removal signal</p>
            <p class="value">${removal.summary.repositoriesWithPossibleRemoval}/${removal.summary.repositoriesScanned}</p>
            <p><strong>Read:</strong> no repositories in the sample currently show a possible removal event for the <code>${removal.summary.markerPackage}</code> marker under the current rule.</p>
            <p>${removal.analysis.limitation}</p>
          </section>
        </div>
        <h3>Experimental Removal Table</h3>
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
          <p><strong>Proxy rate source:</strong> <code>${proxyRate.source.url}</code></p>
          <p><strong>Removal source:</strong> <code>${removal.source.url}</code></p>
          <p><strong>Dashboard built from:</strong> local JSON artifacts in <code>data/</code></p>
          <p><strong>Big caveat:</strong> the broader-adoption and removal metrics are still proxies built from filtered samples. They are useful for directional thinking, not for ecosystem-wide claims.</p>
        </section>
      </section>
      </details>
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
  const [downloads, removal, proxyRate] = await Promise.all([
    readJson("primary-validator-adoption.json"),
    readJson("exploratory-removal-signal.json"),
    readJson("exploratory-downstream-usage.json"),
  ]);

  await fs.mkdir(CHARTS_DIR, { recursive: true });
  await fs.writeFile(
    OUTPUT_FILE,
    buildHtml(downloads, removal, proxyRate),
    "utf8"
  );
  console.log(`Saved dashboard to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(`Failed to build dashboard: ${error.message}`);
  process.exitCode = 1;
});
