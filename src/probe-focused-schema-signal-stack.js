const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const SAMPLE_FILE = path.join(__dirname, "..", "data", "schema-probe-sample.json");
const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "focused-schema-signal-stack.json"
);
const PROGRESS_FILE = path.join(
  __dirname,
  "..",
  "data",
  "focused-schema-signal-stack.partial.json"
);

const JSON_FILE_PATTERN = /\.(json|jsonc)$/i;
const SCHEMA_FILE_PATTERN = /\.schema\.json$/i;
const SCHEMA_PATH_PATTERN = /(^|\/)(schema|schemas)(\/|$)/i;
const OPENAPI_PATH_PATTERN = /(openapi|swagger).*\.(json|ya?ml)$/i;
const JSON_SCHEMA_URL_PATTERN = /json-schema\.org/i;
const SCHEMA_KEYWORD = '"$schema"';
const DEPENDENCY_MARKERS = [
  "ajv",
  "ajv-formats",
  "ajv-keywords",
  "json-schema",
  "schema-utils",
  "@types/json-schema",
];
const IGNORE_PATH_PATTERN =
  /(^|\/)(\.github|\.vscode|node_modules|dist|build|coverage|vendor|test|tests|__tests__|fixtures|examples|example|demo|demos)(\/|$)/i;
const TEXT_FILE_PATTERN = /\.(json|ya?ml|jsonc)$/i;
const MAX_CONTENT_FILES_PER_REPO = 10;
const MAX_BLOB_SIZE = 200000;

function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
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

async function fetchJson(url) {
  const body = await fetchText(url);

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`Could not parse JSON: ${error.message}`);
  }
}

function decodeBlobContent(blob) {
  const content = typeof blob.content === "string" ? blob.content.replace(/\n/g, "") : "";
  return Buffer.from(content, blob.encoding || "base64").toString("utf8");
}

async function fetchBlob(owner, repo, sha) {
  const blobUrl = `https://api.github.com/repos/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`;
  return fetchJson(blobUrl);
}

function rankContentCandidate(entry) {
  const lowerPath = entry.path.toLowerCase();
  let score = 0;

  if (SCHEMA_FILE_PATTERN.test(entry.path)) {
    score += 10;
  }
  if (OPENAPI_PATH_PATTERN.test(entry.path)) {
    score += 8;
  }
  if (SCHEMA_PATH_PATTERN.test(lowerPath)) {
    score += 6;
  }
  if (/config.*\.(json|ya?ml)$/.test(lowerPath) || /.*config\.(json|ya?ml)$/.test(lowerPath)) {
    score += 3;
  }
  if (/openapi|swagger|schema|spec/.test(lowerPath)) {
    score += 2;
  }
  if (/package\.json$/.test(lowerPath)) {
    score += 1;
  }

  return score;
}

function selectContentCandidates(treeEntries) {
  return (treeEntries || [])
    .filter(
      (entry) =>
        entry.type === "blob" &&
        TEXT_FILE_PATTERN.test(entry.path) &&
        !IGNORE_PATH_PATTERN.test(entry.path) &&
        typeof entry.size === "number" &&
        entry.size > 0 &&
        entry.size <= MAX_BLOB_SIZE
    )
    .map((entry) => ({ ...entry, score: rankContentCandidate(entry) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, MAX_CONTENT_FILES_PER_REPO);
}

function findPackageJsonEntry(treeEntries) {
  return (treeEntries || []).find(
    (entry) => entry.type === "blob" && entry.path === "package.json"
  );
}

function extractDependencyMarkers(packageJsonText) {
  try {
    const parsed = JSON.parse(packageJsonText);
    const allDeps = {
      ...(parsed.dependencies || {}),
      ...(parsed.devDependencies || {}),
      ...(parsed.peerDependencies || {}),
      ...(parsed.optionalDependencies || {}),
    };

    return DEPENDENCY_MARKERS.filter((name) => Object.hasOwn(allDeps, name));
  } catch {
    return [];
  }
}

function buildRepositoryScore(signals) {
  let score = 0;

  if (signals.schemaKeywordPaths.length > 0 || signals.schemaUrlPaths.length > 0) {
    score += 3;
  }
  if (signals.schemaFilePaths.length > 0 || signals.schemaDirectoryPaths.length > 0) {
    score += 2;
  }
  if (signals.dependencyMarkers.length > 0) {
    score += 1;
  }

  return score;
}

async function probeRepository(repository) {
  const [owner, repo] = repository.repository.split("/");
  const treeUrl = `https://api.github.com/repos/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(
    repository.defaultBranch
  )}?recursive=1`;

  console.log(`[signal-stack] fetching tree for ${repository.repository}`);
  const tree = await fetchJson(treeUrl);
  const entries = tree.tree || [];

  const jsonFiles = entries.filter(
    (entry) => entry.type === "blob" && JSON_FILE_PATTERN.test(entry.path)
  );
  const packageJsonEntry = findPackageJsonEntry(entries);
  const schemaFilePaths = entries
    .filter((entry) => entry.type === "blob" && SCHEMA_FILE_PATTERN.test(entry.path))
    .map((entry) => entry.path);
  const schemaDirectoryPaths = entries
    .filter((entry) => entry.type === "blob" && SCHEMA_PATH_PATTERN.test(entry.path))
    .map((entry) => entry.path)
    .slice(0, 10);

  const contentCandidates = selectContentCandidates(entries);
  const schemaKeywordPaths = [];
  const schemaUrlPaths = [];

  for (const entry of contentCandidates) {
    const blob = await fetchBlob(owner, repo, entry.sha);
    const text = decodeBlobContent(blob);

    if (text.includes(SCHEMA_KEYWORD)) {
      schemaKeywordPaths.push(entry.path);
    }

    if (JSON_SCHEMA_URL_PATTERN.test(text)) {
      schemaUrlPaths.push(entry.path);
    }
  }

  let dependencyMarkers = [];
  if (packageJsonEntry) {
    const blob = await fetchBlob(owner, repo, packageJsonEntry.sha);
    dependencyMarkers = extractDependencyMarkers(decodeBlobContent(blob));
  }

  const denominatorSignals = {
    hasAnyJsonFile: jsonFiles.length > 0,
    hasPackageJson: Boolean(packageJsonEntry),
    hasTsconfigJson: entries.some(
      (entry) =>
        entry.type === "blob" && /(^|\/)tsconfig(\..+)?\.json$/i.test(entry.path)
    ),
    hasOpenApiFile: entries.some(
      (entry) => entry.type === "blob" && OPENAPI_PATH_PATTERN.test(entry.path)
    ),
  };

  const schemaSignals = {
    schemaKeywordPaths,
    schemaUrlPaths,
    schemaFilePaths,
    schemaDirectoryPaths,
    dependencyMarkers,
  };

  return {
    repository: repository.repository,
    defaultBranch: repository.defaultBranch,
    stars: repository.stars,
    starBand: repository.starBand,
    denominatorSignals,
    schemaSignals,
    schemaSignalScore: buildRepositoryScore(schemaSignals),
  };
}

function buildOutput(sample, values) {
  const jsonBearingRepos = values.filter((entry) => entry.denominatorSignals.hasAnyJsonFile);
  const schemaPositiveRepos = values.filter((entry) => entry.schemaSignalScore > 0);

  return {
    metric: "focused_schema_signal_stack",
    source: {
      name: "GitHub repository tree API plus blob API",
      url: "https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1",
    },
    sample: {
      sourceFile: "data/schema-probe-sample.json",
      cohort: "focusedPreparedSubset",
      repositoriesScanned: values.length,
      randomSeed: sample.sample.randomSeed,
    },
    summary: {
      repositoriesScanned: values.length,
      jsonBearingRepos: jsonBearingRepos.length,
      schemaPositiveRepos: schemaPositiveRepos.length,
      schemaShareAmongJsonBearing:
        jsonBearingRepos.length > 0
          ? Math.round((schemaPositiveRepos.length / jsonBearingRepos.length) * 1000) / 10
          : 0,
    },
    values,
    analysis: {
      interpretation:
        schemaPositiveRepos.length > 0
          ? "At least some focused repositories show stacked JSON Schema signals when multiple cues are combined. This suggests a multi-signal approach may surface usage more reliably than any single probe alone."
          : "No focused repositories crossed the schema-signal threshold in this run. That suggests either the cohort is still poorly aligned with JSON Schema usage or the current signal stack is still too weak.",
      limitation:
        "This is still a small focused subset and a heuristic scoring experiment. It is useful for exploration, not for ecosystem-wide claims.",
      basis: {
        strongSignals: ["$schema", "json-schema.org URL"],
        mediumSignals: ["*.schema.json", "schemas/ path"],
        weakSignals: ["dependency markers"],
      },
    },
    fetchedAt: new Date().toISOString(),
  };
}

async function writeOutput(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  try {
    const sample = JSON.parse(await fs.readFile(SAMPLE_FILE, "utf8"));
    const focused = sample.cohorts.focusedPreparedSubset || [];
    const values = [];

    console.log(`[signal-stack] focused repositories queued: ${focused.length}`);

    for (const [index, repository] of focused.entries()) {
      console.log(`[signal-stack] ${index + 1}/${focused.length} starting ${repository.repository}`);
      values.push(await probeRepository(repository));
      await writeOutput(PROGRESS_FILE, buildOutput(sample, values));
      console.log(
        `[signal-stack] saved partial progress: ${values.length}/${focused.length} repositories`
      );
    }

    const output = buildOutput(sample, values);
    await writeOutput(OUTPUT_FILE, output);
    console.log(`Saved signal stack probe to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(`Failed to probe focused schema signal stack: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
