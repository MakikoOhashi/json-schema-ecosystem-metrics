const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const SEARCH_LANGUAGES = ["JavaScript", "TypeScript"];
const DEFAULT_BROAD_SAMPLE_SIZE = 40;
const DEFAULT_FOCUSED_SAMPLE_SIZE = 20;
const RANDOM_SEED = "gsoc-observability-2026";
const MIN_STARS = 10;
const MIN_SIZE = 50;
const DEFAULT_CANDIDATES_PER_LANGUAGE = 100;
const NOISE_PATTERN =
  /\b(test|tests|example|examples|demo|sandbox|starter|boilerplate|template|tutorial)\b/i;
const SIGNAL_PATTERN =
  /\b(api|openapi|json|schema|config|validate|validation|spec)\b/i;
const SCHEMA_FILE_PATTERN = /\.schema\.json$/i;

const OUTPUT_DIR = path.join(__dirname, "..", "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "exploratory-downstream-usage.json");

function readPositiveInt(name, fallback) {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const BROAD_SAMPLE_SIZE = readPositiveInt(
  "BROAD_SAMPLE_SIZE",
  DEFAULT_BROAD_SAMPLE_SIZE
);
const FOCUSED_SAMPLE_SIZE = readPositiveInt(
  "FOCUSED_SAMPLE_SIZE",
  DEFAULT_FOCUSED_SAMPLE_SIZE
);
const CANDIDATES_PER_LANGUAGE = readPositiveInt(
  "CANDIDATES_PER_LANGUAGE",
  DEFAULT_CANDIDATES_PER_LANGUAGE
);

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

  return {
    eligible: true,
    prioritizedBySignalTerms: SIGNAL_PATTERN.test(haystack),
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

function findSchemaFileMarkers(treeEntries) {
  return (treeEntries || [])
    .filter((entry) => entry.type === "blob" && SCHEMA_FILE_PATTERN.test(entry.path))
    .map((entry) => entry.path);
}

async function attachSchemaFileCheck(repository) {
  try {
    const treeUrl = `https://api.github.com/repos/${repository.full_name}/git/trees/${encodeURIComponent(
      repository.default_branch
    )}?recursive=1`;
    const treeResponse = await fetchJson(treeUrl);
    const hasPackageJson = (treeResponse.tree || []).some(
      (entry) => entry.type === "blob" && entry.path === "package.json"
    );

    if (!hasPackageJson) {
      return {
        repository: repository.full_name,
        language: repository.language,
        defaultBranch: repository.default_branch,
        stars: repository.stargazers_count,
        size: repository.size,
        pushedAt: repository.pushed_at,
        packageJsonPresent: false,
        schemaFileMarkers: [],
        hasAnyMarker: false,
      };
    }

    const schemaFileMarkers = findSchemaFileMarkers(treeResponse.tree);

    return {
      repository: repository.full_name,
      language: repository.language,
      defaultBranch: repository.default_branch,
      stars: repository.stargazers_count,
      size: repository.size,
      pushedAt: repository.pushed_at,
      packageJsonPresent: true,
      schemaFileMarkers,
      hasAnyMarker: schemaFileMarkers.length > 0,
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
        schemaFileMarkers: [],
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

function buildCohortSummary(findings) {
  const repositoriesWithAnyMarker = findings.filter((entry) => entry.hasAnyMarker).length;

  return {
    eligibleRepos: findings.length,
    repositoriesScanned: findings.length,
    repositoriesWithAnyMarker,
    proxyRatePercent:
      findings.length > 0 ? roundPercent((repositoriesWithAnyMarker / findings.length) * 100) : 0,
    unit: "percent",
  };
}

function buildComparisonAnalysis(broadSummary, focusedSummary) {
  const delta = roundPercent(focusedSummary.proxyRatePercent - broadSummary.proxyRatePercent);

  let interpretation;
  if (focusedSummary.proxyRatePercent > broadSummary.proxyRatePercent) {
    interpretation =
      "The focused API/config/validation cohort exposed *.schema.json files more often than the broader filtered JS/TS cohort. That suggests schema-file probes align better with this focused cohort than package metadata probes did.";
  } else if (focusedSummary.proxyRatePercent === broadSummary.proxyRatePercent) {
    interpretation =
      "The broad and focused cohorts produced the same schema-file rate in this run. That suggests schema-file visibility is still limited even after narrowing the cohort.";
  } else {
    interpretation =
      "The focused API/config/validation cohort exposed *.schema.json files less often than the broader filtered JS/TS cohort. That suggests the focused cohort filter may still be stricter than this schema-file probe supports.";
  }

  return {
    interpretation,
    limitation:
      "This remains a proxy comparison, not a census. Both cohort definitions depend on GitHub search coverage, the package.json requirement, sample sizes, and the use of *.schema.json files as the probe.",
    basis: {
      comparison: "broad-cohort-vs-focused-cohort",
      randomSeed: RANDOM_SEED,
      broadSampleSize: BROAD_SAMPLE_SIZE,
      focusedSampleSize: FOCUSED_SAMPLE_SIZE,
      broadProxyRatePercent: broadSummary.proxyRatePercent,
      focusedProxyRatePercent: focusedSummary.proxyRatePercent,
      percentagePointDelta: delta,
      schemaFilePattern: SCHEMA_FILE_PATTERN.source,
    },
  };
}

function buildOutput(cohorts, selection) {
  const broadSummary = buildCohortSummary(cohorts.broad.values);
  const focusedSummary = buildCohortSummary(cohorts.focused.values);

  return {
    metric: "schema_file_cohort_comparison",
    sample: {
      searchLanguages: SEARCH_LANGUAGES,
      broadSampleSize: BROAD_SAMPLE_SIZE,
      focusedSampleSize: FOCUSED_SAMPLE_SIZE,
      randomSeed: RANDOM_SEED,
      eligibility: {
        minStars: MIN_STARS,
        minSize: MIN_SIZE,
        publicOnly: true,
        forksExcluded: true,
        archivedExcluded: true,
        demoLikeNamesExcluded: true,
        packageJsonRequired: true,
      },
      cohorts: {
        broad: {
          name: "broad_filtered_js_ts_repositories",
          description:
            "Active JS/TS repositories with package.json after basic filtering.",
        },
        focused: {
          name: "api_config_validation_oriented_repositories",
          description:
            "Subset of the broad cohort whose names, descriptions, or topics include API/config/validation/schema signal terms.",
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
    },
    source: {
      name: "GitHub search API plus package.json and repository tree API",
      url: "https://api.github.com/search/repositories",
    },
    filtering: {
      candidateReposFound: selection.candidateReposFound,
      broadEligibleReposAfterFiltering: selection.broadEligibleReposAfterFiltering,
      focusedEligibleReposAfterFiltering: selection.focusedEligibleReposAfterFiltering,
      excludedCounts: selection.excludedCounts,
    },
    cohorts: {
      broad: {
        summary: broadSummary,
        values: cohorts.broad.values,
      },
      focused: {
        summary: focusedSummary,
        values: cohorts.focused.values,
      },
    },
    analysis: buildComparisonAnalysis(broadSummary, focusedSummary),
    fetchedAt: new Date().toISOString(),
  };
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

    const broadCandidates = filteredCandidates;
    const focusedCandidates = filteredCandidates.filter(
      (repository) => eligibilityMap.get(repository.full_name)?.prioritizedBySignalTerms
    );

    const broadSampleRepositories = shuffleWithSeed(
      broadCandidates,
      `${RANDOM_SEED}-broad`
    ).slice(0, Math.min(BROAD_SAMPLE_SIZE, broadCandidates.length));
    const focusedSampleRepositories = shuffleWithSeed(
      focusedCandidates,
      `${RANDOM_SEED}-focused`
    ).slice(0, Math.min(FOCUSED_SAMPLE_SIZE, focusedCandidates.length));

    const sampledByName = new Map();

    for (const repository of [...broadSampleRepositories, ...focusedSampleRepositories]) {
      if (!sampledByName.has(repository.full_name)) {
        sampledByName.set(repository.full_name, repository);
      }
    }

    const sampledFindingsByName = new Map();
    const packageJsonMissing = [];

    for (const repository of sampledByName.values()) {
      const finding = await attachSchemaFileCheck(repository);

      if (!finding.packageJsonPresent) {
        packageJsonMissing.push("missing_package_json");
        continue;
      }

      finding.prioritizedBySignalTerms =
        eligibilityMap.get(repository.full_name)?.prioritizedBySignalTerms || false;
      sampledFindingsByName.set(repository.full_name, finding);
    }

    const broadSample = broadSampleRepositories
      .map((repository) => sampledFindingsByName.get(repository.full_name))
      .filter(Boolean);
    const focusedSample = focusedSampleRepositories
      .map((repository) => sampledFindingsByName.get(repository.full_name))
      .filter(Boolean);

    const output = buildOutput(
      {
        broad: { values: broadSample },
        focused: { values: focusedSample },
      },
      {
        candidateReposFound: candidates.length,
        broadEligibleReposAfterFiltering: broadCandidates.length,
        focusedEligibleReposAfterFiltering: focusedCandidates.length,
        excludedCounts: summarizeExclusions([...excludedReasons, ...packageJsonMissing]),
      }
    );

    await writeOutputs(output);

    console.log(`Saved JSON to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(`Failed to fetch schema usage proxy rate: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
