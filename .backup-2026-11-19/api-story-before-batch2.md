---
description: Analyse an ADO user story and add API tests for it to a fork of "RegressionSuite-Octopus API(Complete)", run them with Newman, report, then clean up the fork
argument-hint: "<work item ID, e.g. 186076>"
---

Work item: **$ARGUMENTS**. Follow CLAUDE.md for every rule (compliance, secrets, Test environment, Test user, Test type). Never print or store passwords or tokens.

## Fixed facts
- Postman workspace **QA Testing** = `2e8cfd6e-3949-4c17-8aaa-55dcdb6c9f2f`
- ORIGINAL collection **RegressionSuite-Octopus API(Complete)** = `34291118-f32466a7-b2ad-4820-adfc-ec8e6d9b708b` — **read-only. Never pass this ID to any create/update/put/patch/delete/merge tool.**
- Auth: request "Get Token" = `POST {{BaseURL}}/Data.svc/json/Authenticate` using `{{Database}}`, `{{UID}}`, `{{Password}}`. Reuse it; never put real credentials in the collection.
- The collection is very large: `getCollection` on the whole thing times out. Read the root folder list first, then only the folders you need (`getCollectionFolder` / `getCollectionRequest`, or `searchPostmanElements` filtered by collectionId).
- Existing per-story Postman environments are named like `QA-<ID>-MASTER` / `QA-<ID>-ABROWN`; general ones `QA1Main-MASTER`, `Regression-Staging-<YYYY>M<MM>`. They can be used as `--base-env` for other variables.

## 0. Preconditions (stop and tell me if any fails)
1. Postman tools are in **full** mode: `createCollectionFork`, `createCollectionFolder`, `createCollectionRequest`, `deleteCollection`, `createCollectionPullRequest` must exist (check `getEnabledTools`).
2. `node api-run.mjs` exists and `POSTMAN_API_KEY` is set (the script reports it if missing).

## 1. Read the story
Use the `ado` tools: description, acceptance criteria, QA Notes, all comments. Apply CLAUDE.md "Test environment", "Test user" and "Test type". If the test type is UI only, stop and say this command is for API work.

## 2. Confirm before touching Postman (AskUserQuestion, one question)
"AB#<ID> — <title>. Host <host>, database from <comment author/date>, API base <url> (<given in story | derived web→api: please confirm>), user <USER>, test type <API|Both>. Proceed?"
Options: **Yes** · **Change API base URL** · **Change user** · **Cancel**.
The API base is NOT always web→api (Staging web2026M11 uses api2025M9). If the story or a comment gives an API URL, use it.

## 3. Snapshot the original
Record the original's root folder names and `updatedAt` in `api-results/AB#<ID>/report.md` (section "Original before").

## 4. Fork
`createCollectionFork` of the original into QA Testing with label `AB#<ID>-<YYYYMMDD>`. Verify with `getCollectionForks` (or the fork's metadata) that it exists and its root folders match the original. Write the fork UID into report.md. **From here on, every write uses the fork UID only — check the collectionId before each write call.**

## 5. Analyse structure (in the fork)
- List root folders; open only those matching the story's object/module (AbEntry, Workflow, UDO, Opportunity, Lead, Task, Interaction, User, …).
- From 2–3 existing requests in that folder note: naming style, headers, payload shape, test-script/assertion style, helper functions, variable usage, cleanup pattern.
- Folder rule: matching parent exists → create subfolder `AB#<ID>` inside it. None → create a parent with the object name, then `AB#<ID>`. Never create a duplicate parent.

## 6. Design — stop for my review
Write the scenarios per acceptance criterion: positive, negative (invalid/missing fields, wrong types, invalid keys, unauthorized/forbidden), boundary (min/max, empty/null, special chars, duplicates), permission (MASTER vs ABROWN / CRUD rights), regression (related behaviour unchanged). Avoid duplicates of tests that already exist. Show a draft coverage matrix:
| User Story Requirement | API Request | Test Scenario | Validation | Execution Status |
Wait for my OK.

## 7. Implement (fork only)
- Create requests inside `AB#<ID>` in execution order. First request: reuse/copy "Get Token". Last request(s): cleanup of created data.
- Chaining: **collection variables** prefixed with the story, e.g. `AB186076_CreatedKey`; set them in Tests with `pm.collectionVariables.set(...)`, reset them at the start of the folder; never hardcode keys/IDs; never use environment variables for chain values.
- Created data is named with prefix `QA_AUTO_AB<ID>_`.
- Tests: status code, response structure/schema, mandatory properties, types, expected values, business rules, error codes/messages, permissions — in the collection's existing style. Reuse helpers instead of copying big blocks.
- For permission cases as ABROWN, put them in a separate subfolder `AB#<ID>/ABROWN` so they can run with `abrown`.
- Do not modify any existing request, folder or variable outside `AB#<ID>`.

## 8. Execute and fix (max 3 rounds)
`node api-run.mjs <user> "<story URL>" --collection <FORK UID> --folder "AB#<ID>" --api-base <confirmed URL> [--base-env <env uid>] --out "api-results/AB#<ID>/run-<n>"`
(ABROWN subfolder: same with `abrown` and `--folder "ABROWN"`.)
Read `summary.md`. For each failure decide: **implementation issue** (fix the request/test in the fork and re-run) or **product defect** (keep the test as is, report it). Never weaken an assertion to make it pass. Only Newman results count as Passed; anything not run is **Not Executed** with the reason.

## 9. Report
Write `api-results/AB#<ID>/report.md`: user story info, collection info (original, fork name/UID, parent folder reused/created, new folders), implementation counts (requests, assertions, positive/negative/boundary/permission, chained requests, collection variables), execution results from Newman (executed/passed/failed/not executed, defects, implementation issues), the final coverage matrix, uncovered criteria with reasons. Show it in chat.

## 10. Hand-off, then delete the fork — stop for my approval
1. Export the `AB#<ID>` folder (with `getCollectionFolder` + its requests) to `api-results/AB#<ID>/AB#<ID>.folder.json`.
2. Create a pull request fork → original (`createCollectionPullRequest`), title `AB#<ID> API tests`. I review and merge it myself.
3. Ask me: **Delete the fork now** · **Keep it until I merge**.
4. On "delete": confirm the ID equals the fork UID from step 4 and is NOT `34291118-f32466a7-b2ad-4820-adfc-ec8e6d9b708b`, then `deleteCollection`. Verify it is gone. If deletion fails, report it once; don't retry in a loop.
5. Compare the original's root folders/`updatedAt` with step 3 and state whether it is unchanged (a merge I did myself is expected to change it).
