# Gulf2Global

Evidence-first used-auto-parts listing prototype for **Noor, a fictional Dubai seller**. React + TypeScript, Node/Express, and persistent SQLite. Scope: ten active demo mirrors, twenty synthetic seed records, English/Arabic, UAE → UK. No live eBay or WhatsApp API. Seller approval is mandatory.

## Run locally

Requires **Node 22.13+** (Node 24 recommended) and npm. SQLite uses Node's built-in `node:sqlite`; no database installation is needed. Node may print its experimental SQLite warning.

```sh
npm install
npm run fixtures
```

Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`). The default mock provider needs no API key.

```sh
npm run dev
```

Open **http://localhost:5173**. API: http://localhost:3001. On an empty database, twenty fixtures seed automatically. The inventory initially shows the ten-part demo batch; select “All 20 + imported records” to see the full sample.

For a single production-style local server:

```sh
npm run build
npm start
```

Open **http://localhost:3001**. The development server proxies `/api` and uploads to port 3001. If changing backend `PORT`, also change the proxy in `vite.config.ts`.

## Demo 1 — complete mirror

1. Open **G2G-001**, the Toyota Camry left mirror. Inspect **Record**, **Listing draft**, and **Readiness**.
2. It is **Ready for seller review**, not automatically approved. Its synthetic seller log records adjustment-motor testing only; other functions remain not tested. Compatibility comes from the fictional approved reference, not the donor record.
3. Choose **Review & approve**. Compare source facts with the buyer-facing disclosures; expand the full description.
4. Check “I, Noor, approve this exact listing draft.” Click **Approve this revision**, then **Publish (mock)**.
5. Download the eBay-style JSON. It includes `mock: true`, `live_api_called: false`, an approval revision, and the dated TEST checklist. It is a demonstration payload, not a valid production eBay API contract. Shipping policy IDs are deliberately null.
6. Correct the packed weight in Record. The draft, checklist and readiness update; the prior approval becomes invalid. Publishing now requires a new review.

## Demo 2 — difficult Corolla

1. Open **G2G-002**, or use the hero's difficult-part demo link.
2. The donor year has two values: **2017** from the spreadsheet and **2018** from an Arabic dismantling note. Neither is silently selected. The part number is partly unreadable. The mounting tab is damaged. The mirror is not tested.
3. On **Questions**, switch to **العربية** at the top to see RTL bilingual questions. Answer in either language. Each answer is immediately `seller-confirmed` with audit history.
4. In this fictional demonstration only, Noor's further label inspection and dismantling card support these answers:

| Field | Fictional answer |
| --- | --- |
| Donor year | `2018` (note: verified dismantling card) |
| Part number | `SYN-TO-2101-R` (only enter after a clearer-label inspection; never infer from `??`) |
| Defects | `Damaged mounting tab` |
| Testing status | `Not tested` or `لم يتم الاختبار` |
| Included components | `Mirror glass, housing, mounting base; no wiring harness` |
| Packed dimensions (cm) | `35 x 24 x 19` |
| Packed weight (kg) | `2.4` |

These are demo answers, not inferred details. Upload your own **synthetic** JPG/PNG/WebP label image via Import if demonstrating the clearer-photo step. Seed SVG photos are illustrative placeholders, not actual inspection evidence.

5. After corrections, the defect and “Not tested” disclosure remain. **Independently supported compatibility** remains **Unverified - not claimed** because there is no Corolla reference. Unverified donor fields are still listed separately. Explicitly unclaimed compatibility does not prevent seller review.
6. Use the assistant's “Fully functional & fits all Corollas” chip. The request is refused with a compliant alternative. Attempts to hide damage, add unsupported draft wording, or record a broad functionality claim also fail backend validation.

## Import and source merging

- Spreadsheet/donor CSVs use headers matching `shared/types.ts`. Use `part_id` in every row. Donor JSON is an array of objects. New explicit IDs create separate records; existing IDs merge evidence. No fuzzy matching by appearance or donor vehicle.
- CSV fields: `part_type`, `manufacturer`, `part_number`, `side`, `donor_make`, `donor_model`, `donor_year`, `condition`, `defects`, `testing_status`, `included_components`, `packed_dimensions`, `packed_weight`, `storage_location`, `asking_price`. Price is GBP, packed dimensions cm, packed weight kg.
- `short_description` is preserved as a note. Mock extraction does **not** guess fields from free prose.
- Photos and pasted notes require selecting their part. Real WhatsApp is not connected. Original notes and all field evidence remain visible.
- In mock mode, EN/AR text extraction accepts explicit `field: value` lines. Examples: `side: Left`, `defects: Damaged mounting tab`, `الجهة: يمين`, `الوزن: 2.4`, `الاختبار: لم يتم الاختبار`.
- Extracted evidence is **Unverified**, even at high confidence. Contradictory values become **Conflicting**. Imports never create seller-recorded positive test results. “Not tested” is the safe fallback.
- Photo upload limit: 12 files, 8 MB each, PNG/JPEG/WebP signatures checked. Mock vision attaches the file but does not pretend to inspect it.
- Re-importing after a seller resolution can reopen a genuine contradiction. This is deliberate; source conflict cannot be ignored.

## Configurable LLM / vision

Default `LLM_PROVIDER=mock` is reproducible offline. It performs deterministic explicit-key extraction and no photo interpretation. To enable a provider:

```dotenv
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your-key
LLM_MODEL=gpt-4o-mini
```

Use a provider/model supporting structured JSON schema and image inputs. Model responses are validated with Zod, source quotes, allowed photo fields, unreadable-identifier rules and conservative source statuses. Text claims must be explicitly present in their quoted source. Photo observations are never confirmed by the model. Manufacturer, donor vehicle, fitment and testing cannot be inferred from photos. API key remains server-side. With a configured provider, uploaded synthetic images/notes are sent to that provider; use synthetic material only. Provider errors preserve the source and report warnings rather than fabricating values. Live provider behavior is not covered by the offline benchmark.

Only HTTPS endpoints are allowed by default. `ALLOW_LOCAL_LLM=true` permits a compatible provider on localhost over HTTP.

## Compatibility reference data

Use **Manage reference dataset** to view/replace the approved dataset. CSV/JSON fields: `id`, `manufacturer`, `part_number`, `side`, `make`, `model`, `year_from`, `year_to`, `configuration`, `reference`, `approved`. `approved` is boolean (or CSV `true`/`false`); false rows are ignored. Explicit seller approval of the independent dataset is required.

Matching requires **confirmed manufacturer + complete part number + side**. Reference configurations and UK connector/configuration cautions remain in the listing. Neither an exact match nor this prototype guarantees fitment. Replacement regenerates drafts and invalidates previous listing approvals. The seeded dataset is approved **fictional test data**, not a real manufacturer catalogue.

## Trust enforcement

- Every field stores value, source, status, confidence and all evidence; confidence never substitutes for confirmation.
- Missing/conflicting required facts block approval. Excluded/unidentified categories or unresolved conflicts require specialist review.
- Defects from photo/note evidence remain disclosed with “please confirm” until seller confirmation. Previously recorded damage cannot simply be erased. If an observation is wrong, retain it with a seller dispute note for specialist handling; automated defect deletion is intentionally not supported.
- Only scoped seller testing can be recorded; a positive test needs a method/date/result note. “Fully functional,” authenticity certification and blanket fitment are not allowed.
- Editable title uses only grounded title tokens. Description permits line reordering/formatting while preserving every generated disclosure line. Item-specific edits go through Record so field provenance cannot be bypassed. This conservative prototype intentionally does not allow arbitrary marketing prose.
- Approval includes a fingerprint of the record revision, draft, approved references, and dated checklist. Corrections/imports/reference changes invalidate it. Direct publish requests without current approval fail.
- `checklist.json` is versioned **TEST-1.0**, dated **2026-10-27**. Banner: **“Test checklist only. Not legal or customs clearance.”** Carrier, service, charges, glass protection and import review are reminders, not completed shipping bookings or clearance checks.
- This is a local single-seller prototype, without production authentication/authorization, rate limiting, virus scanning, concurrent database transactions or multi-tenant isolation. Do not expose it publicly or use it for real goods. Its whitelist/validation guards are not a production security certification.

## Evaluation and tests

```sh
npm test
npm run evaluate
npm run build
```

The unit/integration suite covers normal and difficult flows, bilingual extraction, conflicts, defects, prohibited claims, seller testing, stale revisions, approval gates, reference replacement and mock publication. API tests use a separate temporary SQLite database and never alter the active seller database.

`npm run evaluate` writes `data/evaluation_result.json`. **Impact** exposes the same scoring plus separate current-session correction/approval/mock-publish counts.

- Both benchmark workflows use the same **original twenty synthetic packets**, independent of live seller corrections.
- `answer_key.json` is used **only by evaluation**, never extraction or drafting. It specifies expected attributes, gaps/conflicts, mandatory defects and deliberately unclaimed compatibility.
- `manual_baseline.json` contains **simulated**, clearly labelled operator times and outputs, not a measured user study.
- Preparation time measures actual in-process prototype generation, compared with separately labelled simulated manual totals. Human reading/answering/review time is not measured; no real-user speed improvement is claimed.
- Accuracy is 300 attribute checks. Gap and conflict detection compare questions/statuses to the answer key. Condition completeness checks all required defect disclosures. Safe compatibility scoring rewards explicit uncertainty and penalizes unsupported claims.
- “Corrections before approval” is reported as unresolved prototype questions versus simulated manual correction counts. It is not a measured correction study; honest open questions are not treated as model failures.
- Fixtures and answer key are authored together in `scripts/fixtures.mjs`, not an independently collected benchmark. Scores establish expected behavior for this finite synthetic sample, not real-world extraction accuracy. Actual LLM vision/text accuracy requires independent annotated data and testing.

## Files

- `src/`: responsive React UI, all six screens, language/RTL support.
- `server/engine.ts`: evidence merge, validation, questions, grounded drafts, checklist, fingerprint.
- `server/index.ts`: imports, records, approvals, mock payloads and evaluation APIs.
- `server/llm.ts`: configurable structured text/vision adapter and deterministic mock.
- `server/store.ts`: SQLite persistence.
- `scripts/fixtures.mjs`: twenty synthetic records and illustrative SVGs.
- `data/`: inventory/donor CSV/JSON, EN/AR notes, approved compatibility, dated checklist, answer key and simulated baseline.
- `tests/`: unit and isolated API integration tests.

Data persists in `data/gulf2global.sqlite`. To obtain a fresh demo **without deleting your existing database**, stop the server and set `DB_PATH=./data/fresh-demo.sqlite` in `.env`, then restart. `npm run fixtures` regenerates source fixtures but does not reset existing SQLite records. Keep `.codebuddy` intact.
