# metaMelanomaTrials

Melanoma treatment evidence, an interactive treatment map, study tables,
meta-analysis and sample-size planning.

## Run locally

```sh
git clone https://github.com/YushuShi/metaMelanomaTrials.git
cd metaMelanomaTrials
python app.py
```

Open http://127.0.0.1:5021/. Python 3.11+ is required; reviewing the saved
website needs no API key, sign-in, Node installation or paid model requests.
Use `python app.py --port 5022` if port 5021 is occupied.

The application opens on **Treatment map**. **Studies** provides searchable
comparators/interventions, endpoints, advanced filters and CSV downloads.
Comparison views support forest plots, funnel plots, sensitivity analysis and
trial planning when eligible evidence is available. Independent cohorts determine
the model: one individual estimate, two fixed-effect, three or more REML
random-effects. Related publications are consolidated before pooling.

## Saved evidence

This repository includes the current published R2/R3 website snapshot. The fixed
review scope contains 2,538 articles, with 1,072 completed full-text assessments
in this published snapshot. Counts of articles and independent cohorts differ.
The ongoing complementary Opus verification has not been applied to this snapshot.
Missing estimates and screening/validation limitations remain visible in the data.

Large result JSON files are stored as deterministic `.json.gz` files. The Python
server transparently serves their original URLs with gzip encoding. Decompressed
bytes match the original scientific files; `release/public_snapshot.json` records
both compressed and original checksums. Do not edit compressed artifacts by hand.

The research pipeline is in `src/metamelanoma`, with schemas, prompts, scientific
configuration, source normalization and tests included. The public snapshot supports
local evidence review. Restarting screening requires the owner's separate original
source corpus, accounting databases, approved plans and private credentials.
`python app.py` never starts those jobs. Do not use `--refresh` without the private
research workspace.

Raw article downloads, complete request/response histories, accounting databases,
credentials and local evidence backups are not distributed. Source identifiers,
citations and selected evidence passages remain in the saved website results.
Third-party articles and excerpts retain their original publishers' rights.

## Development

```sh
python -m pip install -e .
python scripts/unpack_public_snapshot.py
PYTHONPATH=src python -m unittest discover -s tests/current
node --test website/tests/*.cjs
```

Some integration/audit tests require the private original-source workspace and
are therefore unavailable from a public clone. Offline unit checks use fixtures.
See `docs/TREATMENT_MAP.md`, `docs/TREATMENT_NORMALIZATION.md` and
`website/DATA_CONTRACT.md` for the analysis and display contracts.
