# Submission Notes

## Deliverables checklist

- README.md: PASS. Run instructions, metric scope, API choice, output paths, and limitations are documented and match the current implementation.
- Output JSON (`output/ajv-weekly-downloads.json`): PASS. Generated successfully by running `node src/fetch-ajv-weekly-downloads.js` on 2026-03-11 and contains the expected single metric structure.
- Visualization (`charts/ajv-weekly-downloads.html`): PASS. Generated successfully from the same run and reflects the JSON values and source metadata.
- Part 2 evaluation (`docs/part2-evaluation.md`): FAIL. File is not present in the repository.
- Part 2 input dataset (`projects/initial-data/`): FAIL. Directory is not present in the repository.

## Part 1 completion status

Part 1 is functionally complete for the current minimal scope. Direct observation from an actual run on 2026-03-11 confirmed that the script fetched `ajv` weekly downloads from the npm downloads API and wrote:

- `output/ajv-weekly-downloads.json`
- `charts/ajv-weekly-downloads.html`

Observed output values from that run:

- package: `ajv`
- period: `2026-03-03` through `2026-03-09`
- downloads: `264141721`
- fetchedAt: `2026-03-11T02:45:50.364Z`

README consistency check:

- Output file paths in README match the generated files.
- The README description of the metric as a single weekly npm downloads signal matches the code and outputs.
- The README statement about using the npm downloads point endpoint matches the implementation.

## Part 2 completion status

Part 2 is not complete in the current repository state.

## If Part 2 was not possible: exact reason

Part 2 could not be validated or submitted because both expected inputs for that stage are missing from the repository:

- `projects/initial-data/` does not exist.
- `docs/part2-evaluation.md` does not exist.

Because those artifacts are absent, there is no Part 2 dataset to evaluate and no Part 2 write-up to check for consistency.

## AI assistance note

AI assistance was used for integrator/editor work only:

- read the repository artifacts and checked whether the expected deliverables were present
- ran the existing Part 1 script once to directly verify the generated outputs
- compared README claims against the generated JSON and HTML
- wrote this submission note summarizing observed status, gaps, and remaining risks

No project redesign, metric expansion, or code replacement was performed.

## Remaining risks

- Part 2 remains unsubmitted until `projects/initial-data/` and `docs/part2-evaluation.md` are provided.
- The observed npm downloads value is time-dependent and will change on later runs, so any submission should treat the current JSON and chart as point-in-time artifacts from 2026-03-11.
- There is no automated test coverage; verification here is based on one direct execution of the script.
