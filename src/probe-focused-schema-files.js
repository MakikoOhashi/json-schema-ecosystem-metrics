const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const SAMPLE_FILE = path.join(__dirname, "..", "data", "schema-probe-sample.json");
const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "focused-schema-file-probe.json"
);
const SCHEMA_FILE_PATTERN = /\.schema\.json$/i;

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

function findSchemaFileMarkers(treeEntries) {
  return (treeEntries || [])
    .filter((entry) => entry.type === "blob" && SCHEMA_FILE_PATTERN.test(entry.path))
    .map((entry) => entry.path);
}

async function probeRepository(repository) {
  const [owner, repo] = repository.repository.split("/");
  const treeUrl = `https://api.github.com/repos/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(
    repository.defaultBranch
  )}?recursive=1`;
  console.log(`[probe] fetching tree for ${repository.repository} (${repository.defaultBranch})`);
  const tree = await fetchJson(treeUrl);
  const schemaFileMarkers = findSchemaFileMarkers(tree.tree);
  console.log(
    `[probe] completed ${repository.repository}: ${schemaFileMarkers.length} schema-file marker(s)`
  );

  return {
    repository: repository.repository,
    defaultBranch: repository.defaultBranch,
    stars: repository.stars,
    starBand: repository.starBand,
    schemaFileMarkers,
    hasAnyMarker: schemaFileMarkers.length > 0,
  };
}

function buildOutput(sample, values) {
  const positives = values.filter((entry) => entry.hasAnyMarker);

  return {
    metric: "focused_schema_file_probe",
    source: {
      name: "GitHub repository tree API",
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
      repositoriesWithSchemaFiles: positives.length,
      positiveRatePercent:
        values.length > 0 ? Math.round((positives.length / values.length) * 1000) / 10 : 0,
    },
    values,
    analysis: {
      interpretation:
        positives.length > 0
          ? "The focused cohort exposed *.schema.json files in at least some repositories, so this probe appears capable of surfacing explicit schema-file usage in the narrowed cohort."
          : "The focused cohort did not expose *.schema.json files in this run. That may indicate either low explicit schema-file visibility or a mismatch between this probe and the selected repositories.",
      limitation:
        "This is still a small, JS/TS-facing focused subset. Tree access can also be affected by GitHub API limits, so a clean zero should be treated cautiously.",
      basis: {
        schemaFilePattern: SCHEMA_FILE_PATTERN.source,
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

    console.log(`[probe] focused repositories queued: ${focused.length}`);

    for (const [index, repository] of focused.entries()) {
      console.log(
        `[probe] ${index + 1}/${focused.length} starting ${repository.repository}`
      );
      values.push(await probeRepository(repository));
    }

    const output = buildOutput(sample, values);
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`Saved focused probe to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(`Failed to probe focused schema files: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
