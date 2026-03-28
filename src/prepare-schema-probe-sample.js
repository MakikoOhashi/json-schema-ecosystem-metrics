const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const SEARCH_LANGUAGES = ["JavaScript", "TypeScript"];
const RANDOM_SEED = "gsoc-observability-2026";
const MIN_STARS = 10;
const MIN_SIZE = 50;
const DEFAULT_CANDIDATES_PER_LANGUAGE = 100;
const DEFAULT_SAMPLE_SIZE = 50;
const NOISE_PATTERN =
  /\b(test|tests|example|examples|demo|sandbox|starter|boilerplate|template|tutorial)\b/i;
const SIGNAL_PATTERN =
  /\b(api|openapi|json|schema|config|validate|validation|spec)\b/i;

const OUTPUT_DIR = path.join(__dirname, "..", "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "schema-probe-sample.json");

function readPositiveInt(name, fallback) {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const CANDIDATES_PER_LANGUAGE = readPositiveInt(
  "CANDIDATES_PER_LANGUAGE",
  DEFAULT_CANDIDATES_PER_LANGUAGE
);
const SAMPLE_SIZE = readPositiveInt("PROBE_SAMPLE_SIZE", DEFAULT_SAMPLE_SIZE);

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

function formatDate(date) {
  return date.toISOString().slice(0, 10);
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
    focusedSignal: SIGNAL_PATTERN.test(haystack),
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

function summarizeExclusions(excludedReasons) {
  const summary = {};

  for (const reason of excludedReasons) {
    summary[reason] = (summary[reason] || 0) + 1;
  }

  return summary;
}

function splitIntoStarStrata(repositories) {
  const sorted = [...repositories].sort(
    (left, right) =>
      (right.stargazers_count || 0) - (left.stargazers_count || 0) ||
      left.full_name.localeCompare(right.full_name)
  );
  const lowCut = Math.floor(sorted.length / 3);
  const highCut = Math.floor((sorted.length * 2) / 3);

  return {
    high: sorted.slice(0, lowCut),
    mid: sorted.slice(lowCut, highCut),
    low: sorted.slice(highCut),
  };
}

function distributeCounts(total, strata) {
  const order = ["high", "mid", "low"];
  const counts = { high: 0, mid: 0, low: 0 };
  const available = {
    high: strata.high.length,
    mid: strata.mid.length,
    low: strata.low.length,
  };
  let remaining = total;

  const base = Math.floor(total / order.length);
  for (const key of order) {
    counts[key] = Math.min(base, available[key]);
    remaining -= counts[key];
  }

  while (remaining > 0) {
    let assigned = false;

    for (const key of order) {
      if (counts[key] < available[key]) {
        counts[key] += 1;
        remaining -= 1;
        assigned = true;
        if (remaining === 0) {
          break;
        }
      }
    }

    if (!assigned) {
      break;
    }
  }

  return counts;
}

function toSampleEntry(repository, eligibility, starBand) {
  return {
    repository: repository.full_name,
    language: repository.language,
    defaultBranch: repository.default_branch,
    stars: repository.stargazers_count,
    size: repository.size,
    pushedAt: repository.pushed_at,
    starBand,
    focusedSignal: Boolean(eligibility.focusedSignal),
  };
}

async function writeOutput(data) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  try {
    const candidates = await searchCandidateRepositories();
    const excludedReasons = [];
    const eligible = [];
    const eligibilityByName = new Map();

    for (const repository of candidates) {
      const eligibility = evaluateEligibility(repository);
      eligibilityByName.set(repository.full_name, eligibility);

      if (!eligibility.eligible) {
        excludedReasons.push(eligibility.reason);
        continue;
      }

      eligible.push(repository);
    }

    const strata = splitIntoStarStrata(eligible);
    const sampleCounts = distributeCounts(
      Math.min(SAMPLE_SIZE, eligible.length),
      strata
    );

    const sampled = ["high", "mid", "low"].flatMap((starBand) =>
      shuffleWithSeed(strata[starBand], `${RANDOM_SEED}-${starBand}`)
        .slice(0, sampleCounts[starBand])
        .map((repository) =>
          toSampleEntry(
            repository,
            eligibilityByName.get(repository.full_name) || { focusedSignal: false },
            starBand
          )
        )
    );

    const focusedWithinSample = sampled.filter((entry) => entry.focusedSignal);

    const output = {
      metric: "schema_probe_sample_preparation",
      sample: {
        searchLanguages: SEARCH_LANGUAGES,
        randomSeed: RANDOM_SEED,
        requestedSampleSize: SAMPLE_SIZE,
        preparedSampleSize: sampled.length,
        eligibility: {
          minStars: MIN_STARS,
          minSize: MIN_SIZE,
          publicOnly: true,
          forksExcluded: true,
          archivedExcluded: true,
          demoLikeNamesExcluded: true,
        },
        strata: {
          high: { eligibleRepos: strata.high.length, sampledRepos: sampleCounts.high },
          mid: { eligibleRepos: strata.mid.length, sampledRepos: sampleCounts.mid },
          low: { eligibleRepos: strata.low.length, sampledRepos: sampleCounts.low },
        },
      },
      filtering: {
        candidateReposFound: candidates.length,
        broadEligibleReposAfterFiltering: eligible.length,
        focusedSignalReposWithinEligible: eligible.filter(
          (repository) => eligibilityByName.get(repository.full_name)?.focusedSignal
        ).length,
        excludedCounts: summarizeExclusions(excludedReasons),
      },
      cohorts: {
        broadPreparedSample: sampled,
        focusedPreparedSubset: focusedWithinSample,
      },
      analysis: {
        interpretation:
          "This file prepares a reproducible 50-repository sample before any heavier schema-file probing runs. It is intended to separate sample selection from later GitHub tree inspection.",
        limitation:
          "The sample is still derived from GitHub search metadata, so it reflects search coverage and metadata filtering choices rather than a full census.",
        basis: {
          comparison: "stars-stratified-sample-preparation",
          sampleSize: sampled.length,
          focusedSubsetSize: focusedWithinSample.length,
          candidatesPerLanguage: CANDIDATES_PER_LANGUAGE,
        },
      },
      fetchedAt: new Date().toISOString(),
    };

    await writeOutput(output);
    console.log(`Saved sample to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(`Failed to prepare schema probe sample: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
