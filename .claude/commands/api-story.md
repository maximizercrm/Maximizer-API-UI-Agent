---
description: Analyse an ADO user story and add API tests for it to the existing "Claude" fork of RegressionSuite-Octopus API(Complete), run them with Newman, report, and open a pull request
argument-hint: "<work item ID, e.g. 186076>"
---

Work item: **$ARGUMENTS**. Follow CLAUDE.md for every rule (compliance, secrets, Test environment, Test user, Test type, statuses). Never print or store passwords or tokens.

**Read `api/collections/conventions.md` first and follow it** for request format, naming, assertions, variables and clean-up. Where it says "New tests:", that rule wins over what older requests do.

## Fixed facts
- Postman workspace **QA Testing** = `2e8cfd6e-3949-4c17-8aaa-55dcdb6c9f2f`
- ORIGINAL collection **RegressionSuite-Octopus API(Complete)** = `34291118-f32466a7-b2ad-4820-adfc-ec8e6d9b708b` — **read-only. Never pass this ID to any create/update/put/patch/delete/merge tool.**
- WORKING FORK **RegressionSuite-Octopus API(Complete)**, fork label **Claude** = `34291118-70db2f8a-2142-47ca-a9b4-e1ad6326437d` (forked from the original). **All story work goes here. Never create another fork. Never delete this fork** — it is shared by every story.
- Auth: request "Get Token" = `POST {{BaseURL}}/Data.svc/json/Authenticate` using `{{Database}}`, `{{UID}}`, `{{Password}}`. Reuse it; never put real credentials in the collection.
- The collection is very large: `getCollection` on the whole thing times out. Read the root folder list first, then only the folders you need (`getCollectionFolder` / `getCollectionRequest`, or `searchPostmanElements` filtered by collectionId).
- Existing per-story Postman environments are named like `QA-<ID>-MASTER` / `QA-<ID>-ABROWN`; general ones `QA1Main-MASTER`, `Regression-Staging-<YYYY>M<MM>`. They can be used as `--base-env` for other variables.

## 0. Preconditions (stop and tell me if any fails)
0. `node check-setup.mjs` reports READY (newman installed, POSTMAN_API_KEY present, Postman API reachable).
1. Postman tools are in **full** mode: `createCollectionFolder`, `createCollectionRequest`, `updateCollectionRequest`, `getCollectionFolder`, `createCollectionPullRequest` must exist (check `getEnabledTools`).
2. The local export `api/collections/RegressionSuite-Octopus-API-Complete.json` may be used for read-only structure searches (it can be out of date — confirm folder names in the fork).

## 1. Read the story
Use the `ado` tools: description, acceptance criteria, QA Notes, all comments. Apply CLAUDE.md "Test environment", "Test user" and "Test type". If the test type is UI only, stop and say this command is for API work.

## 2. Confirm before touching Postman (AskUserQuestion, one question)
"AB#<ID> — <title>. Host <host>, database from <comment author/date>, API base <url> (<given in story | derived web→api: please confirm>), user <USER>, test type <API|Both>. Proceed?"
Options: **Yes** · **Change API base URL** · **Change user** · **Cancel**.
The API base is NOT always web→api (Staging web2026M11 uses api2025M9). If the story or a comment gives an API URL, use it.

## 3. Snapshot the original, check for earlier work
- Record the original's root folder names and `updatedAt` in `api-results/AB#<ID>/report.md` (section "Original before").
- Search the original **and the Claude fork** for an existing `AB#<ID>` folder or requests named `<ID>-…`. If found, this is a **re-run**: show me what exists and ask whether to **extend/fix those requests in the fork** or **stop**. Never create a second `AB#<ID>` folder.

## 4. Use the "Claude" fork
- Read the fork's metadata and check: label **Claude**, forked from `34291118-f32466a7-b2ad-4820-adfc-ec8e6d9b708b`. If not, stop.
- If the fork is behind the original (`getSourceCollectionStatus`), tell me and ask whether to pull the original's changes into the fork first (`pullCollectionChanges`, fork only). Don't pull without my OK.
- Write the fork UID into report.md. **Every write uses the fork UID `34291118-70db2f8a-2142-47ca-a9b4-e1ad6326437d` only — check the collectionId before each write call.**

## 5. Analyse structure (in the fork)
- The fork may already hold other stories' `AB#<ID>` folders: leave them untouched.
- List root folders; open only those matching the story's object/module (AbEntry, Workflow, UDO, Opportunity, Lead, Task, Interaction, User, …).
- From 2–3 existing requests in that folder note: naming style, headers, payload shape, test-script/assertion style, helper functions, variable usage, cleanup pattern.
- Folder rule: matching parent exists → create subfolder `AB#<ID>` inside it. None → create a parent with the object name, then `AB#<ID>`. Never create a duplicate parent.

## 6. Design — stop for my review
Write the scenarios per acceptance criterion: positive, negative (invalid/missing fields, wrong types, invalid keys, unauthorized/forbidden), boundary (min/max, empty/null, special chars, duplicates), permission (MASTER vs ABROWN / CRUD rights), regression (related behaviour unchanged). Avoid duplicates of tests that already exist. Show a draft coverage matrix:
| User Story Requirement | API Request | Test Scenario | Validation | Execution Status |
Wait for my OK.

## 7. Implement (fork only)
- Create requests inside `AB#<ID>` in execution order, following `conventions.md` (body templates, SQL/Legacy pairs where data access is involved, naming `<ID>-<SQL-|Legacy-><Action> <check>`). Don't copy "Get Token" into the folder — `api-run.mjs` runs it first. Last request(s): delete everything created.
- Chaining: **collection variables** prefixed with the story, e.g. `AB186076_CompanyKey`; the first request's pre-request resets them (snippet in conventions §5); never hardcode keys/IDs; never use environment variables or globals for chain values.
- Created data is named with prefix `QA_AUTO_AB<ID>_`.
- Tests: follow conventions §4 — `Validate Code:<n>` first, one `Check <Field>` per field, existence/length check before value checks on Read (Data is an array), types where relevant, exact error `Code` + message text for negatives, permissions. Don't re-add Status 200/content-type checks (the collection script does them). If a request legitimately returns non-200 or another content type, add its exact name to the collection test script's skip list (fork only) and note it for the PR.
- For permission cases as ABROWN, put them in a separate subfolder `AB#<ID>/ABROWN` so they can run with `abrown`.
- Do not modify any existing request, folder or variable outside `AB#<ID>`.

## 8. Execute and fix (max 3 rounds)
`node api-run.mjs <user> "<story URL>" --collection 34291118-70db2f8a-2142-47ca-a9b4-e1ad6326437d --folder "<Parent>/AB#<ID>" --api-base <confirmed URL> [--base-env <env uid>] --out "api-results/AB#<ID>/run-<n>"`
(It runs Authenticate/Get Token first automatically. ABROWN subfolder: same with `abrown` and `--folder "<Parent>/AB#<ID>/ABROWN"`. Exit 4 = folder not found or ambiguous → use the full path.)
Read `summary.md`. For each failure decide: **implementation issue** (fix the request/test in the fork and re-run) or **product defect** (keep the test as is, report it). Never weaken an assertion to make it pass. Only Newman results count as Passed; anything not run is **Not Executed** with the reason. Environment/login/tool problems (exit 1, 5, 6, 7, auth failure) are **Blocked**, not product defects.
For each product defect draft a bug (don't create it without my OK):
```
Title: [API] <method> <short failure>
Related Work Item: AB#<ID>
Severity: Critical / High / Medium / Low (CLAUDE.md scale)
Environment: <host> · API base <url> · database from <comment author/date> · user <USER> (never passwords)
Request: POST <BaseURL>/Data.svc/json/<Method> + body (credentials and tokens removed)
Expected: <code / fields / message>
Actual: <code / fields / message>
Evidence: api-results/AB#<ID>/run-<n>/summary.md (+ junit.xml)
```

## 9. Report
Write `api-results/AB#<ID>/report.md`: user story info, collection info (original, fork name/UID, parent folder reused/created, new folders), implementation counts (requests, assertions, positive/negative/boundary/permission, chained requests, collection variables), execution results from Newman (executed/passed/failed/not executed, defects, implementation issues), the final coverage matrix, uncovered criteria with reasons. Show it in chat, and append a short entry to `runs/<YYYY-MM-DD>/run.md` (story, type API, counts, report path).

## 10. Hand-off — stop for my approval
1. Export the `AB#<ID>` folder (with `getCollectionFolder` + its requests) to `api-results/AB#<ID>/AB#<ID>.folder.json`.
2. Ask me whether to open a pull request fork → original now (`createCollectionPullRequest`, title `AB#<ID> API tests`). Warn me that a PR from the shared fork includes **every unmerged change in the fork**, not only this story. I review and merge it myself.
3. **Do not delete the fork or the story folder.** The fork stays for the next story.
4. Compare the original's root folders/`updatedAt` with step 3 and state whether it is unchanged (a merge I did myself is expected to change it).
