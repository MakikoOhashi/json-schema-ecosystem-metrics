const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const SAMPLE_FILE = path.join(__dirname, "..", "data", "schema-probe-sample.json");
const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "focused-schema-keyword-probe.json"
);
const SCHEMA_KEYWORD = '"$schema"';
const TEXT_FILE_PATTERN = /\.(json|ya?ml|jsonc)$/i;
const PATH_HINT_PATTERN = /\b(schema|schemas|openapi|config|spec)\b/i;
const IGNORE_PATH_PATTERN =
  /(^|\/)(\.github|\.vscode|node_modules|dist|build|coverage|vendor|test|tests|__tests__|fixtures|examples|example|demo|demos)(\/|$)/i;
const IGNORE_FILE_PATTERN =
  /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig(\..+)?\.json|eslint\.config\.(js|cjs|mjs)|prettier\.config\.(js|cjs|mjs)|renovate\.json|composer\.json)$/i;
const PRIORITY_SCHEMA_FILE_PATTERN = /\.schema\.json$/i;
const PRIORITY_OPENAPI_PATTERN = /(openapi|swagger).*\.(json|ya?ml)$/i;
const PRIORITY_SCHEMA_PATH_PATTERN = /(^|\/)(schema|schemas)(\/|$)/i;
const PRIORITY_CONFIG_FILE_PATTERN = /(config.*\.(json|ya?ml)|.*config\.(json|ya?ml))$/i;
const MAX_FILES_PER_REPO = 12;
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

function rankCandidate(entry) {
  const pathText = entry.path.toLowerCase();
  let score = 0;

  if (PRIORITY_SCHEMA_FILE_PATTERN.test(entry.path)) {
    score += 10;
  }

  if (PRIORITY_OPENAPI_PATTERN.test(entry.path)) {
    score += 8;
  }

  if (PRIORITY_SCHEMA_PATH_PATTERN.test(pathText)) {
    score += 6;
  }

  if (PRIORITY_CONFIG_FILE_PATTERN.test(entry.path)) {
    score += 3;
  }

  if (PATH_HINT_PATTERN.test(pathText)) {
    score += 2;
  }

  if (/openapi|swagger/i.test(pathText)) {
    score += 2;
  }

  if (/\.ya?ml$/i.test(entry.path)) {
    score -= 1;
  }

  return score;
}

function selectCandidateFiles(treeEntries) {
  return (treeEntries || [])
    .filter(
      (entry) =>
        entry.type === "blob" &&
        TEXT_FILE_PATTERN.test(entry.path) &&
        !IGNORE_PATH_PATTERN.test(entry.path) &&
        !IGNORE_FILE_PATTERN.test(entry.path) &&
        typeof entry.size === "number" &&
        entry.size > 0 &&
        entry.size <= MAX_BLOB_SIZE
    )
    .map((entry) => ({ ...entry, score: rankCandidate(entry) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, MAX_FILES_PER_REPO);
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

async function probeRepository(repository) {
  const [owner, repo] = repository.repository.split("/");
  const treeUrl = `https://api.github.com/repos/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(
    repository.defaultBranch
  )}?recursive=1`;

  console.log(`[probe:$schema] fetching tree for ${repository.repository} (${repository.defaultBranch})`);
  const tree = await fetchJson(treeUrl);
  const candidates = selectCandidateFiles(tree.tree);
  console.log(
    `[probe:$schema] ${repository.repository} candidate files: ${candidates.length}`
  );

  const schemaKeywordMarkers = [];

  for (const [index, entry] of candidates.entries()) {
    console.log(
      `[probe:$schema]   ${repository.repository} file ${index + 1}/${candidates.length}: ${entry.path}`
    );
    const blob = await fetchBlob(owner, repo, entry.sha);
    const text = decodeBlobContent(blob);

    if (text.includes(SCHEMA_KEYWORD)) {
      schemaKeywordMarkers.push(entry.path);
      console.log(
        `[probe:$schema]   ${repository.repository} matched ${SCHEMA_KEYWORD} in ${entry.path}`
      );
      break;
    }
  }

  console.log(
    `[probe:$schema] completed ${repository.repository}: ${schemaKeywordMarkers.length} keyword marker(s)`
  );

  return {
    repository: repository.repository,
    defaultBranch: repository.defaultBranch,
    stars: repository.stars,
    starBand: repository.starBand,
    filesChecked: candidates.length,
    schemaKeywordMarkers,
    hasAnyMarker: schemaKeywordMarkers.length > 0,
  };
}

function buildOutput(sample, values) {
  const positives = values.filter((entry) => entry.hasAnyMarker);

  return {
    metric: "focused_schema_keyword_probe",
    source: {
      name: "GitHub repository tree API plus blob API",
      url: "https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1",
    },
    sample: {
      sourceFile: "data/schema-probe-sample.json",
      cohort: "focusedPreparedSubset",
      repositoriesScanned: values.length,
      focusedEligibleRepos: sample.cohorts.focusedPreparedSubset.length,
      randomSeed: sample.sample.randomSeed,
    },
    summary: {
      repositoriesScanned: values.length,
      repositoriesWithSchemaKeyword: positives.length,
      positiveRatePercent:
        values.length > 0 ? Math.round((positives.length / values.length) * 1000) / 10 : 0,
    },
    values,
    analysis: {
      interpretation:
        positives.length > 0
          ? 'The focused cohort exposed "$schema" in at least some checked files, so content-based probing appears more effective than filename-only probing for this narrowed cohort.'
          : 'The focused cohort still did not expose "$schema" in the checked files. That suggests either genuinely low explicit JSON Schema visibility or that this cohort still does not align well with the probe.',
      limitation:
        'This probe checks a ranked subset of likely text files, not every file in every repository. It is still a small JS/TS-facing focused subset and can be affected by GitHub API limits.',
      basis: {
        keyword: SCHEMA_KEYWORD,
        maxFilesPerRepo: MAX_FILES_PER_REPO,
        maxBlobSize: MAX_BLOB_SIZE,
        positives: positives.length,
        scanned: values.length,
      },
    },
    fetchedAt: new Date().toISOString(),
  };
}

async function main() {
  try {
    const sample = JSON.parse(await fs.readFile(SAMPLE_FILE, "utf8"));
    const focused = sample.cohorts.focusedPreparedSubset || [];
    const values = [];

    console.log(`[probe:$schema] focused repositories queued: ${focused.length}`);

    for (const [index, repository] of focused.entries()) {
      console.log(
        `[probe:$schema] ${index + 1}/${focused.length} starting ${repository.repository}`
      );
      values.push(await probeRepository(repository));
    }

    const output = buildOutput(sample, values);
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`Saved focused keyword probe to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(`Failed to probe focused schema keyword: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
