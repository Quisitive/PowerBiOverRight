# PowerBiOverRight

PowerBiOverRight is a standalone React + TypeScript frontend designed to modernize customer-facing Power BI identity analytics.

The app is focused on:
- Faster sorting of authentication data.
- Clear segmentation by registration type.
- Operational visibility into license assignment state.
- Deployment-ready source validation for PBIX and CSV assets.

## Requirements Implemented

1. New standalone application named `PowerBiOverRight`.
2. Functional customer UI (menus, filters, sorting, paging, export, refresh, reset).
3. Data model built from the TLC demo source folder and PBIX package.
4. Automated testing and build validation.
5. Deployment documentation including roles and assignments.
6. PBIX source verification workflow to ensure sources are current and aligned.

## Source Data and PBIX Inputs

Default source folder:

`C:\Users\CFoulon\OneDrive - Quisitive\Greg Richards's files - PBIX files\TLC_demoTactical`

Synced into app folder:

`public/data`

Key files consumed:
- `EntraMFAregistrations.csv`
- `EntraUsers.csv`
- `EntraLicenseAssignments-v2.csv`
- `customer_Tactical_v1b.pbix`

Generated metadata:
- `public/data/source-manifest.json`
- `public/data/pbix-validation.json`

## Functional UI Controls

Navigation menu:
- `Overview`
- `Authentication Registry`
- `License Signals`

Filters and controls:
- Search
- Registration type filter
- MFA capability filter
- SSPR status filter
- User type filter
- Sort field selector
- Sort direction toggle
- Page size selector
- Pagination (`Previous`, `Next`)
- `Refresh data` button
- `Reset filters` button
- `Export current view` button

## Local Setup

```bash
npm install
```

Sync source files into the app:

```bash
npm run sync:data
```

Run PBIX/source validation:

```bash
npm run validate:pbix
```

Run the app:

```bash
npm run dev
```

## Testing and Validation

Run tests:

```bash
npm run test
```

Run full validation suite:

```bash
npm run validate
```

This executes:
- Lint checks
- Unit/component tests
- Production build
- PBIX source validation

## PBIX Source Integrity Validation

`npm run validate:pbix` performs the following checks:

1. Confirms source path and synced path exist.
2. Verifies source CSV and synced CSV file parity.
3. Verifies PBIX exists in source and synced locations.
4. Compares SHA-256 hash between source PBIX and synced PBIX.
5. Reads PBIX package metadata and inspects `DataMashup` when present.
6. Writes validation report to `public/data/pbix-validation.json`.

Validation status is also shown in the UI under `PBIX source validation`.

## Deployment Roles and Assignments

| Role | Assignment | Deployment Deliverables |
|---|---|---|
| Product Owner | Approve scope, acceptance criteria, release timing | Signed release approval, prioritized backlog |
| Identity Data Engineer | Own source CSV pipeline and PBIX refresh cadence | Updated source files, successful `sync:data` run |
| BI/Identity SME | Validate registration/method classification logic | Data sign-off on registration type results |
| Frontend Engineer | Own UI features, accessibility, performance | Build artifacts, feature completion |
| QA Engineer | Validate controls and regression behavior | Test execution report, defects triaged |
| DevOps Engineer | Manage CI/CD, secrets, environment promotion | Pipeline run history, deployment logs |
| Security Reviewer | Validate data handling and access controls | Security sign-off and risk acceptance |

## Deployment Process

1. Sync and validate source data:
   - `npm run sync:data`
   - `npm run validate:pbix`
2. Execute engineering quality checks:
   - `npm run validate`
3. Build release artifact:
   - `npm run build`
4. Deploy `dist` to hosting environment.
5. Smoke test production controls:
   - View menu switching
   - Sort/filter behavior
   - Export behavior
   - Source status panel
6. Capture deployment evidence and sign-off.

## Optional Source Override

To use a different source folder:

```bash
set POWERBI_SOURCE_ROOT=C:\path\to\your\TLC_demoTactical
set POWERBI_PBIX_NAME=customer_Tactical_v1b.pbix
npm run sync:data
npm run validate:pbix
```

## Known Boundaries

- The app validates PBIX package integrity and source references; it does not trigger a Power BI Desktop refresh operation.
- Some PBIX packages do not include `DataMashup`; in that case the validator falls back to hash and file-parity checks and records a warning.
