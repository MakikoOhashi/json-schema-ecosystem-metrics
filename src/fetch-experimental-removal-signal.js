const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const MARKER_PACKAGE = "ajv";
const HISTORY_DEPTH = 12;
const MIN_SUSTAINED_PRESENCE = 6;
const OUTPUT_DIR = path.join(__dirname, "..", "data");
const PROXY_RATE_FILE = path.join(OUTPUT_DIR, "exploratory-downstream-usage.json");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "exploratory-removal-signal.json");

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

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
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
            reject(new Error(`Request returned status ${response.statusCode}`));
            return;
          }
          resolve(body);
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

async function loadProxySampleRepositories() {
  const content = await fs.readFile(PROXY_RATE_FILE, "utf8");
  const data = JSON.parse(content);

  if (!data?.series?.values || !Array.isArray(data.series.values)) {
    throw new Error("Proxy-rate data did not include a sampled repository list");
  }

  return data.series.values.map((entry) => ({
    name: entry.repository,
    branch: entry.defaultBranch,
  }));
}

async function fetchRecentPackageJsonCommits(repositoryName) {
  const [owner, repo] = repositoryName.split("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?path=package.json&per_page=${HISTORY_DEPTH}`;
  const commits = await fetchJson(url);

  return commits.map((entry) => entry.sha).filter(Boolean);
}

async function fetchPackageJsonState(repositoryName, commitSha) {
  const [owner, repo] = repositoryName.split("/");
  try {
    const packageJsonUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/package.json`;
    const packageJsonText = await fetchText(packageJsonUrl);
    const packageJson = JSON.parse(packageJsonText);

    return {
      commitSha,
      markerPresent: hasMarkerDependency(packageJson),
    };
  } catch (error) {
    if (error.message.includes("status 404")) {
      return {
        commitSha,
        markerPresent: false,
        note: "package.json not found at this commit",
      };
    }

    throw error;
  }
}

function roundPercent(value) {
  return Math.round(value * 10) / 10;
}

function evaluateRepository(history, repositoryName, branch) {
  const headState = history[0];
  const previousStates = history.slice(1);
  const priorPresenceCount = previousStates.filter((entry) => entry.markerPresent).length;
  const removalDetected = !headState.markerPresent && priorPresenceCount >= MIN_SUSTAINED_PRESENCE;

  return {
    repository: repositoryName,
    defaultBranch: branch,
    commitsScanned: history.length,
    headHasMarker: headState.markerPresent,
    priorPresenceCount,
    removalDetected,
    history,
  };
}

function buildAnalysis(summary) {
  let interpretation;

  if (summary.repositoriesWithPossibleRemoval > 0) {
    interpretation =
      "At least one repository in the filtered sample shows a possible removal event: the ajv marker is absent at HEAD after sustained prior presence in recent history.";
  } else {
    interpretation =
      "No repositories in the filtered sample currently show a possible removal event for the ajv marker under this rule-based check.";
  }

  return {
    interpretation,
    limitation:
      "This is an experimental proxy. It only inspects recent package.json history for a single dependency marker and does not prove broader migration away from JSON Schema.",
    basis: {
      comparison: "curated-sample-head-vs-recent-history",
      markerPackage: MARKER_PACKAGE,
      repositoriesScanned: summary.repositoriesScanned,
      repositoriesWithPossibleRemoval: summary.repositoriesWithPossibleRemoval,
      possibleRemovalRatePercent: summary.possibleRemovalRatePercent,
      historyDepth: HISTORY_DEPTH,
      sustainedPresenceThreshold: MIN_SUSTAINED_PRESENCE,
    },
  };
}

function buildOutput(findings) {
  const repositoriesWithPossibleRemoval = findings.filter(
    (entry) => entry.removalDetected
  ).length;
  const repositoriesWithMarkerAtHead = findings.filter((entry) => entry.headHasMarker).length;
  const possibleRemovalRatePercent = roundPercent(
    (repositoriesWithPossibleRemoval / findings.length) * 100
  );

  const summary = {
    markerPackage: MARKER_PACKAGE,
    repositoriesScanned: findings.length,
    repositoriesWithPossibleRemoval,
    repositoriesWithMarkerAtHead,
    possibleRemovalRatePercent,
    historyDepth: HISTORY_DEPTH,
    unit: "percent",
  };

  return {
    metric: "experimental_marker_removal_signal",
    sample: {
      name: "filtered_random_sample_from_schema_usage_proxy_rate",
      repositories: findings.map((entry) => entry.repository),
    },
    source: {
      name: "GitHub commits API and raw package.json history",
      url: "https://api.github.com",
    },
    summary,
    series: {
      interval: "repository",
      unit: "removal_detected",
      values: findings,
    },
    analysis: buildAnalysis(summary),
    fetchedAt: new Date().toISOString(),
  };
}

function buildTableRows(findings) {
  return findings
    .map(
      (entry) => `<tr>
        <td><code>${entry.repository}</code></td>
        <td>${entry.headHasMarker ? "yes" : "no"}</td>
        <td>${entry.priorPresenceCount}</td>
        <td>${entry.removalDetected ? "possible removal" : "none detected"}</td>
      </tr>`
    )
    .join("\n");
}

function buildHtml(data) {
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
    }

    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: linear-gradient(180deg, var(--bg), var(--bg-accent));
      color: var(--ink);
    }

    main {
      max-width: 920px;
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
    <p>Experimental filtered-sample check for possible removal of an explicit JSON Schema-related dependency marker.</p>
    <section class="summary">
      <div class="summary-grid">
        <section class="card">
          <p>Repositories scanned</p>
          <p class="value">${data.summary.repositoriesScanned}</p>
        </section>
        <section class="card">
          <p>Possible removals</p>
          <p class="value">${data.summary.repositoriesWithPossibleRemoval}</p>
        </section>
        <section class="card">
          <p>Possible removal rate</p>
          <p class="value">${data.summary.possibleRemovalRatePercent}%</p>
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
          <li><strong>repositoriesScanned:</strong> ${data.analysis.basis.repositoriesScanned}</li>
          <li><strong>repositoriesWithPossibleRemoval:</strong> ${data.analysis.basis.repositoriesWithPossibleRemoval}</li>
          <li><strong>possibleRemovalRatePercent:</strong> ${data.analysis.basis.possibleRemovalRatePercent}%</li>
          <li><strong>historyDepth:</strong> ${data.analysis.basis.historyDepth}</li>
          <li><strong>sustainedPresenceThreshold:</strong> ${data.analysis.basis.sustainedPresenceThreshold}</li>
        </ul>
      </details>
    </section>
    <section class="history">
      <h2>Per-repository result</h2>
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
${buildTableRows(data.series.values)}
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
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  try {
    const repositories = await loadProxySampleRepositories();
    const findings = [];

    for (const repositoryConfig of repositories) {
      const { name, branch } = repositoryConfig;
      const commits = await fetchRecentPackageJsonCommits(name);

      if (commits.length === 0) {
        findings.push(
          evaluateRepository(
            [{ commitSha: "no-package-json-history", markerPresent: false }],
            name,
            branch
          )
        );
        continue;
      }

      const history = [];

      for (const commitSha of commits) {
        history.push(await fetchPackageJsonState(name, commitSha));
      }

      findings.push(evaluateRepository(history, name, branch));
    }

    const output = buildOutput(findings);
    await writeOutputs(output);

    console.log(`Saved JSON to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(`Failed to fetch experimental removal signal: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
