const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const SEARCH_LANGUAGES = ["JavaScript", "TypeScript"];
const SAMPLE_SIZE = 50;
const RANDOM_SEED = "gsoc-observability-2026";
const MIN_STARS = 10;
const MIN_SIZE = 50;
const CANDIDATES_PER_LANGUAGE = 100;
const NOISE_PATTERN =
  /\b(test|tests|example|examples|demo|sandbox|starter|boilerplate|template|tutorial)\b/i;
const SIGNAL_PATTERN =
  /\b(api|openapi|json|schema|config|validate|validation|spec)\b/i;
const OUTPUT_DIR = path.join(__dirname, "..", "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "exploratory-downstream-usage.json");
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

function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "json-schema-ecosystem-metrics",
          ...headers,
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

async function fetchJson(url, headers = {}) {
  const body = await fetchText(url, {
    Accept: "application/vnd.github+json",
    ...headers,
  });

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`Could not parse JSON: ${error.message}`);
  }
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function roundPercent(value) {
  return Math.round(value * 10) / 10;
}

function hashSeed(text) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText);

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(items, seedText) {
  const random = createSeededRandom(seedText);
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
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

function buildSearchUrl(language) {
  const pushedAfter = formatDate(new Date(Date.now() - 365 * 86400000));
  const query = [
    `language:${language}`,
    `stars:>=${MIN_STARS}`,
    `size:>=${MIN_SIZE}`,
    `pushed:>=${pushedAfter}`,
    "fork:false",
    "archived:false",
  ].join(" ");

  return `https://api.github.com/search/repositories?q=${encodeURIComponent(
    query
  )}&sort=updated&order=desc&per_page=${CANDIDATES_PER_LANGUAGE}`;
}

function evaluateEligibility(repository) {
  const topics = Array.isArray(repository.topics) ? repository.topics.join(" ") : "";
  const haystack = `${repository.name} ${repository.description || ""} ${topics}`;

  if (repository.fork) {
    return { eligible: false, reason: "fork" };
  }

  if (repository.archived) {
    return { eligible: false, reason: "archived" };
  }

  if (!["JavaScript", "TypeScript"].includes(repository.language)) {
    return { eligible: false, reason: "non_js_ts" };
  }

  if ((repository.stargazers_count || 0) < MIN_STARS) {
    return { eligible: false, reason: "low_stars" };
  }

  if ((repository.size || 0) < MIN_SIZE) {
    return { eligible: false, reason: "tiny_repo" };
  }

  if (NOISE_PATTERN.test(haystack)) {
    return { eligible: false, reason: "demo_like" };
  }

  if (!SIGNAL_PATTERN.test(haystack)) {
    return { eligible: false, reason: "low_schema_signal" };
  }

  return {
    eligible: true,
    prioritizedBySignalTerms: true,
  };
}

async function searchCandidateRepositories() {
  const byName = new Map();

  for (const language of SEARCH_LANGUAGES) {
    const response = await fetchJson(buildSearchUrl(language));

    for (const repository of response.items || []) {
      if (!byName.has(repository.full_name)) {
        byName.set(repository.full_name, repository);
      }
    }
  }

  return [...byName.values()];
}

async function attachPackageJsonCheck(repository) {
  const packageJsonUrl = `https://raw.githubusercontent.com/${repository.full_name}/${repository.default_branch}/package.json`;

  try {
    const packageJsonText = await fetchText(packageJsonUrl);
    const packageJson = JSON.parse(packageJsonText);
    const dependencyMarkers = findDependencyMarkers(packageJson);

    return {
      repository: repository.full_name,
      language: repository.language,
      defaultBranch: repository.default_branch,
      stars: repository.stargazers_count,
      size: repository.size,
      pushedAt: repository.pushed_at,
      packageJsonPresent: true,
      dependencyMarkers,
      hasAnyMarker: dependencyMarkers.length > 0,
    };
  } catch (error) {
    if (error.message.includes("status 404")) {
      return {
        repository: repository.full_name,
        language: repository.language,
        defaultBranch: repository.default_branch,
        stars: repository.stargazers_count,
        size: repository.size,
        pushedAt: repository.pushed_at,
        packageJsonPresent: false,
        dependencyMarkers: [],
        hasAnyMarker: false,
      };
    }

    throw error;
  }
}

function summarizeExclusions(excludedReasons) {
  const summary = {};

  for (const reason of excludedReasons) {
    summary[reason] = (summary[reason] || 0) + 1;
  }

  return summary;
}

function buildAnalysis(summary) {
  let interpretation;

  if (summary.proxyRatePercent >= 60) {
    interpretation =
      "A majority of the sampled repositories show at least one explicit JSON Schema-related dependency marker. This suggests meaningful practical adoption within the filtered sample.";
  } else if (summary.proxyRatePercent >= 30) {
    interpretation =
      "Some of the sampled repositories show explicit JSON Schema-related dependency markers, but adoption does not look dominant across the filtered sample.";
  } else {
    interpretation =
      "No sampled repositories showed one of the explicit JSON Schema-related dependency markers checked here. In this proof of concept, that says more about how hard downstream usage is to observe from repository metadata than it does about true absence of JSON Schema usage.";
  }

  return {
    interpretation,
    limitation:
      "This is still a proxy, not a census. The result depends on the GitHub search frame, the stricter eligibility filters, the sample size, and the specific dependency markers checked.",
    basis: {
      comparison: "filtered-github-search-sample",
      randomSeed: RANDOM_SEED,
      sampleSize: SAMPLE_SIZE,
      candidateReposFound: summary.candidateReposFound,
      eligibleReposAfterFiltering: summary.eligibleReposAfterFiltering,
      eligibleReposPrioritizedBySignalTerms:
        summary.eligibleReposPrioritizedBySignalTerms,
      sampledRepos: summary.repositoriesScanned,
      repositoriesWithAnyMarker: summary.repositoriesWithAnyMarker,
      proxyRatePercent: summary.proxyRatePercent,
      dependencyMarkersChecked: SCHEMA_DEPENDENCY_MARKERS,
    },
  };
}

function buildOutput(sampledFindings, selection) {
  const repositoriesWithAnyMarker = sampledFindings.filter((entry) => entry.hasAnyMarker).length;
  const proxyRatePercent = roundPercent(
    (repositoriesWithAnyMarker / sampledFindings.length) * 100
  );

  const summary = {
    candidateReposFound: selection.candidateReposFound,
    eligibleReposAfterFiltering: selection.eligibleReposAfterFiltering,
    eligibleReposPrioritizedBySignalTerms:
      selection.eligibleReposPrioritizedBySignalTerms,
    repositoriesScanned: sampledFindings.length,
    repositoriesWithAnyMarker,
    proxyRatePercent,
    sampleSize: SAMPLE_SIZE,
    randomSeed: RANDOM_SEED,
    unit: "percent",
  };

  return {
    metric: "schema_usage_proxy_rate",
    sample: {
      name: "filtered_random_sample_of_json_using_js_ts_repositories",
      searchLanguages: SEARCH_LANGUAGES,
      sampleSize: SAMPLE_SIZE,
      randomSeed: RANDOM_SEED,
      eligibility: {
        minStars: MIN_STARS,
        minSize: MIN_SIZE,
        publicOnly: true,
        forksExcluded: true,
        archivedExcluded: true,
        demoLikeNamesExcluded: true,
        packageJsonRequired: true,
        prioritizedSignalTerms: [
          "api",
          "openapi",
          "json",
          "schema",
          "config",
          "validate",
          "validation",
          "spec",
        ],
      },
    },
    source: {
      name: "GitHub search API plus raw package.json files",
      url: "https://api.github.com/search/repositories",
    },
    filtering: {
      candidateReposFound: selection.candidateReposFound,
      eligibleReposAfterFiltering: selection.eligibleReposAfterFiltering,
      eligibleReposPrioritizedBySignalTerms:
        selection.eligibleReposPrioritizedBySignalTerms,
      excludedCounts: selection.excludedCounts,
    },
    summary,
    series: {
      interval: "repository",
      unit: "marker_present",
      values: sampledFindings,
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
        <td>${entry.language}</td>
        <td>${entry.stars}</td>
      </tr>`;
    })
    .join("\n");
}

function buildExclusionRows(excludedCounts) {
  return Object.entries(excludedCounts)
    .map(
      ([reason, count]) => `<tr>
        <td><code>${reason}</code></td>
        <td>${count}</td>
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
    <p>Seeded random sample of eligible JavaScript and TypeScript repositories collected from GitHub search, then checked for explicit JSON Schema-related dependency markers in <code>package.json</code>.</p>
    <div class="summary-grid">
      <section class="card">
        <p>Candidate repos found</p>
        <p class="value">${data.summary.candidateReposFound}</p>
      </section>
      <section class="card">
        <p>Eligible repos after filtering</p>
        <p class="value">${data.summary.eligibleReposAfterFiltering}</p>
      </section>
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
    </div>
    <section class="analysis">
      <h2>Short interpretation</h2>
      <p>${data.analysis.interpretation}</p>
      <p><strong>Limitation:</strong> ${data.analysis.limitation}</p>
      <details class="basis-toggle">
        <summary>Show analysis basis</summary>
        <ul class="basis-list">
          <li><strong>comparison:</strong> ${data.analysis.basis.comparison}</li>
          <li><strong>randomSeed:</strong> ${data.analysis.basis.randomSeed}</li>
          <li><strong>sampleSize:</strong> ${data.analysis.basis.sampleSize}</li>
          <li><strong>candidateReposFound:</strong> ${data.analysis.basis.candidateReposFound}</li>
          <li><strong>eligibleReposAfterFiltering:</strong> ${data.analysis.basis.eligibleReposAfterFiltering}</li>
          <li><strong>sampledRepos:</strong> ${data.analysis.basis.sampledRepos}</li>
          <li><strong>repositoriesWithAnyMarker:</strong> ${data.analysis.basis.repositoriesWithAnyMarker}</li>
          <li><strong>proxyRatePercent:</strong> ${data.analysis.basis.proxyRatePercent}%</li>
        </ul>
      </details>
    </section>
    <section class="analysis">
      <h2>Filter summary</h2>
      <table>
        <thead>
          <tr>
            <th>Excluded reason</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
${buildExclusionRows(data.filtering.excludedCounts)}
        </tbody>
      </table>
    </section>
    <section class="analysis">
      <h2>Sampled repositories</h2>
      <table>
        <thead>
          <tr>
            <th>Repository</th>
            <th>Any marker</th>
            <th>Dependency markers</th>
            <th>Language</th>
            <th>Stars</th>
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
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  try {
    const candidates = await searchCandidateRepositories();
    const excludedReasons = [];
    const filteredCandidates = [];
    const eligibilityMap = new Map();

    for (const repository of candidates) {
      const eligibility = evaluateEligibility(repository);
      eligibilityMap.set(repository.full_name, eligibility);

      if (!eligibility.eligible) {
        excludedReasons.push(eligibility.reason);
        continue;
      }

      filteredCandidates.push(repository);
    }

    const eligibleFindings = [];
    const packageJsonMissing = [];
    let eligiblePrioritizedCount = 0;

    for (const repository of filteredCandidates) {
      const finding = await attachPackageJsonCheck(repository);

      if (!finding.packageJsonPresent) {
        packageJsonMissing.push("missing_package_json");
        continue;
      }

      if (eligibilityMap.get(repository.full_name)?.prioritizedBySignalTerms) {
        eligiblePrioritizedCount += 1;
      }

      finding.prioritizedBySignalTerms =
        eligibilityMap.get(repository.full_name)?.prioritizedBySignalTerms || false;
      eligibleFindings.push(finding);
    }

    const shuffled = shuffleWithSeed(eligibleFindings, RANDOM_SEED);
    const sampledFindings = shuffled.slice(0, Math.min(SAMPLE_SIZE, shuffled.length));
    const output = buildOutput(sampledFindings, {
      candidateReposFound: candidates.length,
      eligibleReposAfterFiltering: eligibleFindings.length,
      eligibleReposPrioritizedBySignalTerms: eligiblePrioritizedCount,
      excludedCounts: summarizeExclusions([...excludedReasons, ...packageJsonMissing]),
    });

    await writeOutputs(output);

    console.log(`Saved JSON to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(`Failed to fetch schema usage proxy rate: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
