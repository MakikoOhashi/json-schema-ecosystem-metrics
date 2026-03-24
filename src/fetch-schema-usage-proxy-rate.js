const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const REPOSITORIES = [
  { name: "webpack/webpack", branch: "main" },
  { name: "vitejs/vite", branch: "main" },
  { name: "eslint/eslint", branch: "main" },
  { name: "prettier/prettier", branch: "main" },
  { name: "axios/axios", branch: "v1.x" },
  { name: "expressjs/express", branch: "master" },
  { name: "facebook/jest", branch: "main" },
  { name: "openai/openai-node", branch: "master" },
];

const SCHEMA_DEPENDENCY_MARKERS = [
  "ajv",
  "ajv-formats",
  "ajv-keywords",
  "schema-utils",
  "json-schema",
  "json-schema-traverse",
  "json-schema-to-typescript",
  "@types/json-schema",
];

const OUTPUT_DIR = path.join(__dirname, "..", "data");
const CHARTS_DIR = path.join(__dirname, "..", "charts");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "schema-usage-proxy-rate.json");
const CHART_FILE = path.join(CHARTS_DIR, "schema-usage-proxy-rate.html");

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

function findDependencyMarkers(packageJson) {
  const dependencyGroups = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies,
  ];

  const markers = new Set();

  for (const group of dependencyGroups) {
    if (!group) {
      continue;
    }

    for (const marker of SCHEMA_DEPENDENCY_MARKERS) {
      if (Object.prototype.hasOwnProperty.call(group, marker)) {
        markers.add(marker);
      }
    }
  }

  return [...markers];
}

function roundPercent(value) {
  return Math.round(value * 10) / 10;
}

function buildAnalysis(summary) {
  let interpretation;

  if (summary.proxyRatePercent >= 60) {
    interpretation =
      "A majority of the sampled JSON-using repositories show at least one explicit JSON Schema-related marker. This suggests meaningful practical adoption within this curated sample.";
  } else if (summary.proxyRatePercent >= 30) {
    interpretation =
      "Some of the sampled JSON-using repositories show explicit JSON Schema-related markers, but adoption does not look dominant across the curated sample.";
  } else {
    interpretation =
      "Only a small share of the sampled JSON-using repositories show explicit JSON Schema-related markers. This suggests visible but still limited adoption within the curated sample.";
  }

  return {
    interpretation,
    limitation:
      "This is a curated-sample proxy, not a full ecosystem census. Repositories can use JSON Schema without exposing these exact markers, and the sample itself is subjective.",
    basis: {
      comparison: "curated-json-using-repo-sample",
      repositoriesScanned: summary.repositoriesScanned,
      repositoriesWithAnyMarker: summary.repositoriesWithAnyMarker,
      proxyRatePercent: summary.proxyRatePercent,
      dependencyMarkersChecked: SCHEMA_DEPENDENCY_MARKERS,
    },
  };
}

async function fetchRepositoryFinding(repositoryConfig) {
  const { name, branch } = repositoryConfig;
  const [owner, repo] = name.split("/");
  let dependencyMarkers = [];
  try {
    const packageJsonText = await fetchText(
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/package.json`
    );
    const packageJson = JSON.parse(packageJsonText);
    dependencyMarkers = findDependencyMarkers(packageJson);
  } catch (error) {
    if (!error.message.includes("status 404")) {
      throw error;
    }
  }

  return {
    repository: name,
    defaultBranch: branch,
    dependencyMarkers,
    hasAnyMarker: dependencyMarkers.length > 0,
  };
}

function buildOutput(findings) {
  const repositoriesWithAnyMarker = findings.filter((entry) => entry.hasAnyMarker).length;
  const repositoriesWithDependencyMarkers = findings.filter(
    (entry) => entry.dependencyMarkers.length > 0
  ).length;
  const proxyRatePercent = roundPercent(
    (repositoriesWithAnyMarker / findings.length) * 100
  );

  const summary = {
    repositoriesScanned: findings.length,
    repositoriesWithAnyMarker,
    repositoriesWithDependencyMarkers,
    proxyRatePercent,
    unit: "percent",
  };

  return {
    metric: "schema_usage_proxy_rate",
    sample: {
      name: "curated_json_using_js_repositories",
      repositories: REPOSITORIES.map((entry) => entry.name),
    },
    source: {
      name: "raw GitHub package.json files",
      url: "https://raw.githubusercontent.com",
    },
    summary,
    series: {
      interval: "repository",
      unit: "marker_present",
      values: findings,
    },
    analysis: buildAnalysis(summary),
    fetchedAt: new Date().toISOString(),
  };
}

function buildTableRows(findings) {
  return findings
    .map((entry) => {
      const dependencyText =
        entry.dependencyMarkers.length > 0 ? entry.dependencyMarkers.join(", ") : "none";

      return `<tr>
        <td><code>${entry.repository}</code></td>
        <td>${entry.hasAnyMarker ? "yes" : "no"}</td>
        <td>${dependencyText}</td>
        <td><code>${entry.defaultBranch}</code></td>
      </tr>`;
    })
    .join("\n");
}

function buildHtml(data) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JSON Schema usage proxy rate</title>
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
    }

    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: linear-gradient(180deg, var(--bg), var(--bg-accent));
      color: var(--ink);
    }

    main {
      max-width: 980px;
      margin: 42px auto;
      padding: 28px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: 0 10px 24px rgba(31, 41, 51, 0.05);
    }

    h1 {
      margin-top: 0;
      font-size: 2.2rem;
    }

    p,
    td,
    li {
      color: var(--muted);
      line-height: 1.55;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin: 22px 0;
    }

    .card,
    .analysis {
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel-strong);
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
      margin-top: 18px;
    }

    th,
    td {
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
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
      margin: 12px 0 0;
      padding-left: 18px;
    }

    code {
      font-family: "SFMono-Regular", Consolas, monospace;
    }
  </style>
</head>
<body>
  <main>
    <h1>JSON Schema usage proxy rate</h1>
    <p>Curated-sample proxy for how often explicit JSON Schema-related dependency markers appear within a broader set of JSON-using JavaScript and TypeScript repositories.</p>
    <div class="summary-grid">
      <section class="card">
        <p>Repositories scanned</p>
        <p class="value">${data.summary.repositoriesScanned}</p>
      </section>
      <section class="card">
        <p>Repositories with any marker</p>
        <p class="value">${data.summary.repositoriesWithAnyMarker}</p>
      </section>
      <section class="card">
        <p>Proxy rate</p>
        <p class="value">${data.summary.proxyRatePercent}%</p>
      </section>
      <section class="card">
        <p>Repositories with dependency markers</p>
        <p class="value">${data.summary.repositoriesWithDependencyMarkers}</p>
      </section>
    </div>
    <section class="analysis">
      <h2>Short interpretation</h2>
      <p>${data.analysis.interpretation}</p>
      <p><strong>Limitation:</strong> ${data.analysis.limitation}</p>
      <details class="basis-toggle">
        <summary>Show analysis basis</summary>
        <ul class="basis-list">
          <li><strong>comparison:</strong> ${data.analysis.basis.comparison}</li>
          <li><strong>repositoriesScanned:</strong> ${data.analysis.basis.repositoriesScanned}</li>
          <li><strong>repositoriesWithAnyMarker:</strong> ${data.analysis.basis.repositoriesWithAnyMarker}</li>
          <li><strong>proxyRatePercent:</strong> ${data.analysis.basis.proxyRatePercent}%</li>
          <li><strong>dependencyMarkersChecked:</strong> ${data.analysis.basis.dependencyMarkersChecked.join(", ")}</li>
        </ul>
      </details>
    </section>
    <section class="analysis">
      <h2>Repository sample</h2>
      <table>
        <thead>
          <tr>
            <th>Repository</th>
            <th>Any marker</th>
            <th>Dependency markers</th>
            <th>Default branch</th>
          </tr>
        </thead>
        <tbody>
${buildTableRows(data.series.values)}
        </tbody>
      </table>
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
  await fs.writeFile(CHART_FILE, buildHtml(data), "utf8");
}

async function main() {
  try {
    const findings = [];
    for (const repositoryConfig of REPOSITORIES) {
      findings.push(await fetchRepositoryFinding(repositoryConfig));
    }

    const output = buildOutput(findings);
    await writeOutputs(output);

    console.log(`Saved JSON to ${OUTPUT_FILE}`);
    console.log(`Saved chart to ${CHART_FILE}`);
  } catch (error) {
    console.error(`Failed to fetch schema usage proxy rate: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
