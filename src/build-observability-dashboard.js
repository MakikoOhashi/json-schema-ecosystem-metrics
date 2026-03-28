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

function buildHtml(downloads, proxyRate) {
  const labels = downloads.series.rollingAverage7Day.map((point) => point.day);
  const values = downloads.series.rollingAverage7Day.map(
    (point) => point.averageDownloads
  );
  const downloadsChange = downloads.analysis.basis.changePercent;
  const candidateCount = proxyRate.filtering.candidateReposFound;
  const broadEligibleCount = proxyRate.filtering.broadEligibleReposAfterFiltering;
  const focusedEligibleCount = proxyRate.filtering.focusedEligibleReposAfterFiltering;
  const broad = proxyRate.cohorts.broad.summary;
  const focused = proxyRate.cohorts.focused.summary;
  const visibilityGap =
    focused.repositoriesWithAnyMarker <= broad.repositoriesWithAnyMarker &&
    downloads.summary.totalDownloads > 1000000000;

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

    .panel,
    .hero,
    .section-toggle {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: 0 10px 24px rgba(31, 41, 51, 0.05);
    }

    .hero,
    .panel {
      padding: 24px;
      margin-bottom: 18px;
    }

    .section-toggle {
      margin-bottom: 18px;
      overflow: hidden;
    }

    .section-toggle summary {
      cursor: pointer;
      list-style: none;
      padding: 18px 24px;
      font-weight: 700;
      color: var(--ink);
    }

    .section-toggle summary::-webkit-details-marker {
      display: none;
    }

    .section-toggle .panel {
      margin: 0;
      border: 0;
      border-radius: 0;
      box-shadow: none;
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

    p {
      color: var(--muted);
      line-height: 1.55;
    }

    .section-kicker {
      margin: 0 0 8px;
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--line);
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
      background: conic-gradient(#3f7d92 0 ${(broadEligibleCount / candidateCount) * 100}%, #dbe5ec 0 100%);
    }

    .ring-eligible::after {
      inset: 24px;
    }

    .ring-sampled {
      inset: 50px;
      background: conic-gradient(#7299aa 0 ${(focusedEligibleCount / candidateCount) * 100}%, #dbe5ec 0 100%);
    }

    .ring-sampled::after {
      inset: 22px;
    }

    .ring-marker {
      inset: 72px;
      background: conic-gradient(var(--present) 0 ${(focused.repositoriesWithAnyMarker / candidateCount) * 100}%, #dbe5ec 0 100%);
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

    .stack {
      display: grid;
      gap: 14px;
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
      <h1>JSON Schema Signals: Time, Comparison, Summary</h1>
      <p>The dashboard is arranged as a vertical trend first, a horizontal comparison second, and a small summary layer last.</p>
      <div class="summary-grid">
        <section class="summary-card">
          <p>1. Primary Metric</p>
          <p class="value">Time</p>
          <p>Tracks how one important validator signal moves over time.</p>
        </section>
        <section class="summary-card">
          <p>2. Exploratory Metric</p>
          <p class="value">Comparison</p>
          <p>Compares broad and focused cohorts to see where schema usage becomes visible.</p>
        </section>
        <section class="summary-card">
          <p>3. Support Signals</p>
          <p class="value">Summary</p>
          <p>Turns the first two sections into cautious decision hints.</p>
        </section>
      </div>
    </section>

    <section class="panel">
      <p class="section-kicker">1. Primary Metric</p>
      <h2>Time / Change: Ajv Adoption Trend</h2>
      <p>This is the main Part 1 metric. It tracks npm download activity for <code>ajv</code> as a practical proxy for validator-level adoption in the JavaScript ecosystem over time.</p>
      <div class="summary-grid">
        <section class="summary-card">
          <p>Latest 7-day avg</p>
          <p class="value">${formatNumber(downloads.summary.latest7DayAverage)}</p>
        </section>
        <section class="summary-card">
          <p>12-week direction</p>
          <p class="value">${downloadsChange}%</p>
        </section>
        <section class="summary-card">
          <p>Latest week total</p>
          <p class="value">${formatNumber(downloads.summary.latestWeekTotal)}</p>
        </section>
      </div>
      <div class="chart-wrap">
        <canvas id="downloadsChart" aria-label="Ajv 7-day average downloads trend"></canvas>
      </div>
      <section class="analysis">
        <h3>Primary Read</h3>
        <p>${downloads.analysis.interpretation}</p>
        <p><strong>Limitation:</strong> ${downloads.analysis.limitation}</p>
        <details class="basis-toggle">
          <summary>Show analysis basis</summary>
          <ul class="basis-list">
            <li><strong>comparison:</strong> ${downloads.analysis.basis.comparison}</li>
            <li><strong>startingAverageDownloads:</strong> ${formatNumber(downloads.analysis.basis.startingAverageDownloads)}</li>
            <li><strong>endingAverageDownloads:</strong> ${formatNumber(downloads.analysis.basis.endingAverageDownloads)}</li>
            <li><strong>changePercent:</strong> ${downloads.analysis.basis.changePercent}%</li>
            <li><strong>weeklyBuckets:</strong> ${downloads.summary.weeklyBuckets}</li>
          </ul>
        </details>
      </section>
    </section>

    <details class="section-toggle">
      <summary>2. Exploratory Metric: Broad vs Focused Cohort Comparison</summary>
      <section class="panel">
        <p class="section-kicker">2. Exploratory Metric</p>
        <h2>Relative Position: Schema File Usage By Cohort</h2>
        <p>This section is exploratory. It compares the same <code>*.schema.json</code> probe across a broad filtered JS/TS cohort and a narrower API/config/validation-oriented cohort.</p>
        <div class="visible-usage-layout">
          <div class="rings-wrap">
            <div class="rings" aria-label="Concentric rings showing candidate, eligible, sampled, and marker-positive repository counts">
              <div class="ring ring-candidate"></div>
              <div class="ring ring-eligible"></div>
              <div class="ring ring-sampled"></div>
              <div class="ring ring-marker"></div>
              <div class="ring-core">
                <div>
                  <strong>${focused.repositoriesWithAnyMarker}</strong>
                  focused markers
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
                <span>Broad eligible cohort</span>
                <strong>${proxyRate.filtering.broadEligibleReposAfterFiltering}</strong>
              </div>
              <div class="ring-legend-row">
                <span class="swatch swatch-sampled"></span>
                <span>Focused eligible cohort</span>
                <strong>${proxyRate.filtering.focusedEligibleReposAfterFiltering}</strong>
              </div>
              <div class="ring-legend-row">
                <span class="swatch swatch-marker"></span>
                <span>Focused schema-file positives</span>
                <strong>${focused.repositoriesWithAnyMarker}</strong>
              </div>
            </div>
            <section class="mini-card">
              <p>Broad cohort</p>
              <p class="value">${broad.repositoriesWithAnyMarker}/${broad.repositoriesScanned}</p>
              <p><strong>Read:</strong> ${broad.proxyRatePercent}% of the broad filtered cohort contained at least one <code>*.schema.json</code> file.</p>
              <p>This is the looser baseline.</p>
            </section>
            <section class="mini-card">
              <p>Focused cohort</p>
              <p class="value">${focused.repositoriesWithAnyMarker}/${focused.repositoriesScanned}</p>
              <p><strong>Read:</strong> ${focused.proxyRatePercent}% of the focused API/config/validation cohort contained at least one <code>*.schema.json</code> file.</p>
              <p>This is exploratory and should not be read as an ecosystem-wide share.</p>
            </section>
            <section class="mini-card">
              <p>Cohort delta</p>
              <p class="value">${proxyRate.analysis.basis.percentagePointDelta > 0 ? "+" : ""}${proxyRate.analysis.basis.percentagePointDelta} pts</p>
              <p><strong>Read:</strong> focused minus broad marker rate.</p>
              <p>This is the main comparison signal.</p>
            </section>
          </div>
        </div>
        <section class="analysis">
          <h3>Exploratory Read</h3>
          <p>${proxyRate.analysis.interpretation}</p>
          <p><strong>Limitation:</strong> ${proxyRate.analysis.limitation}</p>
        </section>
      </section>
    </details>

    <details class="section-toggle">
      <summary>3. Support Signals</summary>
      <section class="panel">
        <p class="section-kicker">3. Support Signals</p>
        <h2>Summary / Decision Hints</h2>
        <p>This section turns the current two metrics into cautious decision hints. It is intentionally a hypothesis layer, not a firm recommendation.</p>
        <div class="stack">
          <section class="mini-card">
            <p>What looks important now?</p>
            <p class="value">core usage</p>
            <p><strong>Read:</strong> Ajv remains the clearest strong signal in the current proof of concept.</p>
            <p>That makes it a useful anchor for observability, but not the whole ecosystem.</p>
          </section>
          <section class="mini-card">
            <p>What should likely be supported?</p>
            <p class="value">${visibilityGap ? "downstream" : "unclear"}</p>
            <p><strong>Read:</strong> validator-level usage looks strong, but explicit schema-file usage remains selective across the exploratory cohorts.</p>
            <p>If this pattern is real, downstream visibility and explicit schema-file adoption may matter more than core-validator rescue.</p>
          </section>
          <section class="mini-card">
            <p>What may be weakening?</p>
            <p class="value">${downloadsChange < -15 ? "watch trend" : "no sharp decline"}</p>
            <p><strong>Read:</strong> the 12-week downloads direction is the main weakening signal currently available in this proof of concept.</p>
            <p>This is a watch signal, not a diagnosis.</p>
          </section>
        </div>
        <section class="analysis">
          <h3>Provenance and Caveats</h3>
          <p><strong>Downloads source:</strong> <code>${downloads.source.url}</code></p>
          <p><strong>Proxy rate source:</strong> <code>${proxyRate.source.url}</code></p>
          <p><strong>Dashboard built from:</strong> local JSON artifacts in <code>data/</code></p>
          <p><strong>Big caveat:</strong> the exploratory metric is still a proxy comparison built from two filtered cohorts and one file-path probe. It is useful for directional thinking, not for ecosystem-wide claims.</p>
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
          label: "7-day average downloads",
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
  const [downloads, proxyRate] = await Promise.all([
    readJson("primary-validator-adoption.json"),
    readJson("exploratory-downstream-usage.json"),
  ]);

  await fs.mkdir(CHARTS_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, buildHtml(downloads, proxyRate), "utf8");
  console.log(`Saved dashboard to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(`Failed to build dashboard: ${error.message}`);
  process.exitCode = 1;
});
