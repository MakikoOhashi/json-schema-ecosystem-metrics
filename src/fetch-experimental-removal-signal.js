const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const OWNER = "webpack";
const REPO = "schema-utils";
const MARKER_PACKAGE = "ajv";
const HISTORY_DEPTH = 12;
const MIN_SUSTAINED_PRESENCE = 6;
const OUTPUT_DIR = path.join(__dirname, "..", "data");
const CHARTS_DIR = path.join(__dirname, "..", "charts");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "experimental-ajv-removal-signal.json");
const CHART_FILE = path.join(CHARTS_DIR, "experimental-ajv-removal-signal.html");

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

function decodeBase64Utf8(text) {
  return Buffer.from(text, "base64").toString("utf8");
}

function hasMarkerDependency(packageJson) {
  const dependencyGroups = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies,
  ];

  return dependencyGroups.some(
    (group) => group && Object.prototype.hasOwnProperty.call(group, MARKER_PACKAGE)
  );
}

async function fetchPackageJsonState(commitSha) {
  try {
    const response = await fetchJson(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/package.json?ref=${commitSha}`
    );
    const packageJson = JSON.parse(decodeBase64Utf8(response.content));

    return {
      commitSha,
      packageJsonPath: response.path,
      markerPresent: hasMarkerDependency(packageJson),
    };
  } catch (error) {
    if (error.message.includes("status 404")) {
      return {
        commitSha,
        packageJsonPath: "package.json",
        markerPresent: false,
        note: "package.json not found at this commit",
      };
    }

    throw error;
  }
}

function buildAnalysis(history) {
  const headState = history[0];
  const previousStates = history.slice(1);
  const priorPresenceCount = previousStates.filter((entry) => entry.markerPresent).length;
  const removalDetected = !headState.markerPresent && priorPresenceCount >= MIN_SUSTAINED_PRESENCE;

  let interpretation;
  if (removalDetected) {
    interpretation =
      "This repository shows a possible removal event: the ajv dependency is absent at HEAD even though it appeared consistently in the recent commit history.";
  } else if (headState.markerPresent) {
    interpretation =
      "No removal signal is currently detected: the ajv dependency is still present at HEAD in this downstream repository.";
  } else {
    interpretation =
      "No strong removal signal is detected yet. The ajv dependency is absent at HEAD, but it was not present consistently enough across the recent commit window to treat this as sustained removal.";
  }

  return {
    interpretation,
    limitation:
      "This is an experimental proxy. It only inspects package.json history for a single dependency marker and does not prove broader migration away from JSON Schema.",
    basis: {
      comparison: "head-state-vs-recent-package-json-history",
      targetRepository: `${OWNER}/${REPO}`,
      markerPackage: MARKER_PACKAGE,
      commitsScanned: history.length,
      sustainedPresenceThreshold: MIN_SUSTAINED_PRESENCE,
      headHasMarker: headState.markerPresent,
      priorPresenceCount,
      removalDetected,
    },
  };
}

function buildOutput(defaultBranch, history) {
  return {
    metric: "experimental_marker_removal_signal",
    repository: `${OWNER}/${REPO}`,
    source: {
      name: "GitHub commits API and contents API",
      url: `https://api.github.com/repos/${OWNER}/${REPO}/commits?sha=${defaultBranch}&per_page=${HISTORY_DEPTH}`,
    },
    summary: {
      markerPackage: MARKER_PACKAGE,
      defaultBranch,
      commitsScanned: history.length,
      headHasMarker: history[0].markerPresent,
      priorPresenceCount: history.slice(1).filter((entry) => entry.markerPresent).length,
    },
    series: {
      interval: "commit",
      unit: "marker_present",
      values: history,
    },
    analysis: buildAnalysis(history),
    fetchedAt: new Date().toISOString(),
  };
}

function buildHistoryRows(history) {
  return history
    .map((entry) => {
      const status = entry.markerPresent ? "present" : "absent";
      const note = entry.note ? ` <span class="note">(${entry.note})</span>` : "";

      return `<tr>
        <td><code>${entry.commitSha.slice(0, 7)}</code></td>
        <td>${status}${note}</td>
      </tr>`;
    })
    .join("\n");
}

function buildChartHtml(data) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>experimental ajv removal signal</title>
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
      --present: #2e7d60;
      --absent: #8c5a3c;
    }

    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: linear-gradient(180deg, var(--bg), var(--bg-accent));
      color: var(--ink);
    }

    main {
      max-width: 760px;
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

    .summary,
    .analysis,
    .history {
      margin-top: 24px;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel-strong);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }

    .card {
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #ffffff;
    }

    p,
    td {
      color: var(--muted);
      line-height: 1.5;
    }

    .value {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
      color: var(--ink);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 14px;
    }

    th,
    td {
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }

    .note {
      font-size: 0.9rem;
    }

    .status-present {
      color: var(--present);
    }

    .status-absent {
      color: var(--absent);
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
    <h1>experimental ajv removal signal</h1>
    <p>Experimental signal for possible downstream marker removal in a JSON Schema-related adopter.</p>
    <section class="summary">
      <div class="summary-grid">
        <section class="card">
          <p>Target repository</p>
          <p class="value">${data.repository}</p>
        </section>
        <section class="card">
          <p>Commits scanned</p>
          <p class="value">${data.summary.commitsScanned}</p>
        </section>
      </div>
    </section>
    <section class="analysis">
      <h2>Short interpretation</h2>
      <p>${data.analysis.interpretation}</p>
      <p><strong>Limitation:</strong> ${data.analysis.limitation}</p>
      <details class="basis-toggle">
        <summary>Show analysis basis</summary>
        <ul class="basis-list">
          <li><strong>comparison:</strong> ${data.analysis.basis.comparison}</li>
          <li><strong>markerPackage:</strong> ${data.analysis.basis.markerPackage}</li>
          <li><strong>headHasMarker:</strong> ${data.analysis.basis.headHasMarker}</li>
          <li><strong>priorPresenceCount:</strong> ${data.analysis.basis.priorPresenceCount}</li>
          <li><strong>sustainedPresenceThreshold:</strong> ${data.analysis.basis.sustainedPresenceThreshold}</li>
          <li><strong>removalDetected:</strong> ${data.analysis.basis.removalDetected}</li>
        </ul>
      </details>
    </section>
    <section class="history">
      <h2>Recent commit history</h2>
      <table>
        <thead>
          <tr>
            <th>Commit</th>
            <th>Marker state</th>
          </tr>
        </thead>
        <tbody>
${buildHistoryRows(data.series.values)}
        </tbody>
      </table>
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
    const repository = await fetchJson(`https://api.github.com/repos/${OWNER}/${REPO}`);
    const commits = await fetchJson(
      `https://api.github.com/repos/${OWNER}/${REPO}/commits?sha=${repository.default_branch}&per_page=${HISTORY_DEPTH}`
    );
    const history = [];

    for (const commit of commits) {
      history.push(await fetchPackageJsonState(commit.sha));
    }

    const output = buildOutput(repository.default_branch, history);
    await writeOutputs(output);

    console.log(`Saved JSON to ${OUTPUT_FILE}`);
    console.log(`Saved chart to ${CHART_FILE}`);
  } catch (error) {
    console.error(`Failed to fetch experimental removal signal: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
