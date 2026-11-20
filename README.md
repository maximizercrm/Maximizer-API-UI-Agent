# Maximizer QA Agent

A Claude Code agent that tests Maximizer work items from Azure DevOps (ADO). It can:

- **UI testing:** read a User Story / Task / Bug, write acceptance criteria and test cases, push them to Test Plan 193161, run them in a real browser (Playwright), and draft defects.
- **API testing:** add story-specific API tests to the **Claude** fork of the Postman collection *RegressionSuite-Octopus API(Complete)*, run them with Newman, and report.

For every work item, the agent gets the **build URL** from the ticket comments, picks the **test user** (MASTER or ABROWN) and the **test type** (UI / API / Both), and confirms them with you before testing. Passwords stay in `.env` and are never shown to Claude.

---

## 1. Folder layout

| Path | What it is |
|---|---|
| `CLAUDE.md` | The agent's instructions (playbook). Claude Code loads it automatically. |
| `.claude/settings.json` | Permissions (what runs without asking, what always asks, what is blocked) and the screenshot hook. |
| `.claude/commands/api-story.md` | The `/api-story <ID>` command for API testing. |
| `.env` | URLs, user names, passwords, Postman API key. **Never share or commit.** |
| `check-setup.mjs` | Checks the setup without printing any secret. Run at the start of each session. |
| `switch-user.mjs` | Logs in / switches user in the test browser using `.env`. |
| `api-run.mjs` | Runs one Postman folder with Newman against the story's build; writes a report. |
| `tidy-screenshots.mjs` | Moves stray screenshots into `screenshots/` (runs automatically). |
| `helpers/` | Browser helpers for setup/teardown (`admin-set-rights.js`) and read-only inspection (`wf-inspect.js`). Edit only their CONFIG block. |
| `playwright-mcp.config.json` | Browser settings for the Playwright MCP (port 9222, output folder). |
| `api/collections/conventions.md` | How requests and tests are written in the Octopus collection — `/api-story` follows it. |
| `api/collections/*.json` | Local export of the collection (read-only reference; can be out of date). |
| `screenshots/` | All UI screenshots. |
| `api-results/AB#<ID>/` | API run reports, coverage matrix, exported story folder. |
| `runs/<YYYY-MM-DD>/run.md` | Run log for each day. |
| `test-data/`, `test-plans/` | Your test files and plans. |
| `archive/`, `.backup-2026-11-19/` | Old scripts and backups of earlier versions. |

---

## 2. One-time setup

### 2.1 Install

1. Install **Node.js 20.12 or newer** (LTS) from nodejs.org.
2. Install **Claude Code**: `npm install -g @anthropic-ai/claude-code`
3. In this folder, install the packages (Playwright and Newman):
   ```
   cd C:\Users\Rahul\Desktop\ClaudeAgent
   npm install
   npx playwright install chromium
   ```

### 2.2 Fill in `.env`

One block per login, plus the Postman key. Use only test accounts on test servers. Example layout (values are placeholders):

```
QA_URL=https://qa1.maximizercrmlive.com/webMain/<database id>
QA_USERNAME=MASTER
QA_PASSWORD=********

ABROWN_URL=https://qa1.maximizercrmlive.com/webMain/<database id>
ABROWN_USERNAME=ABROWN
ABROWN_PASSWORD=********

STAGING_URL=https://staging1.maximizercrmlive.com/web2026M11/<database id>
STAGING_USERNAME=MASTER
STAGING_PASSWORD=********

STAGING_NONADMIN_URL=https://staging1.maximizercrmlive.com/web2026M11/<database id>
STAGING_NONADMIN_USERNAME=********
STAGING_NONADMIN_PASSWORD=********

POSTMAN_API_KEY=PMAK-********
```

- Each key may appear **only once** (`check-setup.mjs` reports duplicates).
- The `*_URL` hosts define which servers the agent may use (qa1, staging1). Any other host is refused.
- The Postman API key comes from Postman → avatar → **Settings → API keys → Generate API Key**.

### 2.3 Connect the tools to Claude Code

Run these once in Command Prompt (outside Claude Code):

```
:: Azure DevOps
claude mcp add ado -s user -- npx -y @azure-devops/mcp Maximizer

:: Playwright browser, using this folder's config (needed for port 9222 and the screenshots folder)
claude mcp add playwright -s user -- npx -y @playwright/mcp@latest --config C:\Users\Rahul\Desktop\ClaudeAgent\playwright-mcp.config.json

:: Postman, FULL tool set, registered under the name "postman" (the permission rules expect this name)
claude mcp add --transport http postman https://mcp.postman.com/mcp --header "Authorization: Bearer <your Postman API key>"
```

Check with `claude mcp list` that all three connect.

**Optional, stops the ADO account picker:** install the Azure CLI (`winget install -e --id Microsoft.AzureCLI`), open a new window, run `az login` with your Maximizer account, then re-add `ado` with `--authentication azcli` at the end of the command.

### 2.4 Verify

```
cd C:\Users\Rahul\Desktop\ClaudeAgent
node check-setup.mjs
```

It must end with **READY**. `FAIL` lines must be fixed; `WARN` lines only affect the feature named (e.g. the browser on port 9222 is only open after the first Playwright step).

---

## 3. Writing tickets so the agent understands them

Add these to the work item (description, QA Notes or a comment). The newest comment wins.

| What | How to write it | Example |
|---|---|---|
| **Build to test** | A comment with the build URL (the agent ignores any password in it) | `this has been deployed to QA, can you make a regression testing here:`<br>`https://qa1.maximizercrmlive.com/web12715wme/ef43a2f5…` |
| **Test user** | `Test user: <NAME>` or ADO tag `test-user:<name>` | `Test user: ABROWN` |
| **Test type** | `Test type: UI` / `API` / `Both` or ADO tag `test-type:ui|api|both` | `Test type: Both` |
| **API base URL** (API tests) | Optional, if it isn't simply `web<X>` → `api<X>` | `API: https://staging1.maximizercrmlive.com/api2025M9` |

Please **don't put passwords in ADO**. The agent uses `.env` only.

Without markers the agent works it out (MASTER by default; test type from the wording) and asks you to confirm.

---

## 4. Daily use

Start Claude Code in this folder:

```
cd C:\Users\Rahul\Desktop\ClaudeAgent
claude
```

The agent first runs `node check-setup.mjs` and one ADO call.

### 4.1 UI testing

| You type | What happens |
|---|---|
| `Run today's QA workflow` | Lists your items in **To test Branch / Testing Branch**, then works through them |
| `Test 193170` | Works on that item only |
| `Test 193170 end-to-end` | Same, without pausing for review of the test cases (it still asks before writing to ADO) |

For each item the agent:

1. Reads the description, comments and QA Notes.
2. Asks you one question: **build + test user + test type** (e.g. *"Test 193170 on qa1 /web12715wme/ as ABROWN (non-admin), type UI?"*).
3. Writes acceptance criteria and "Verify that…" test cases, then waits for your review.
4. Pushes the test cases to **Test Plan 193161** (asks first; skips titles that already exist). If the suite `<ID> - <Title>` doesn't exist, it asks you to create it in ADO.
5. Logs in with `switch-user.mjs`, runs each step in the browser, and saves screenshots for failures.
6. Drafts defects for real failures and asks which to file in ADO.

### 4.2 API testing

```
/api-story 186076
```

1. Runs the setup checks and reads the story.
2. Asks you to confirm: build, API base URL, user, test type.
3. Opens the **Claude** fork (`34291118-70db2f8a-2142-47ca-a9b4-e1ad6326437d`). If the original has newer changes, it asks before pulling them in.
4. Finds the matching object folder (e.g. `AbEntry`) and creates an `AB#<ID>` subfolder (or reuses it on a re-run).
5. Proposes scenarios with a coverage matrix, then **waits for your OK**.
6. Adds requests and tests following `api/collections/conventions.md`.
7. Runs them with `api-run.mjs` (Get Token runs first automatically), then fixes and re-runs, up to 3 rounds.
8. Writes `api-results/AB#<ID>/report.md` (coverage matrix + results) and drafts defects.
9. Exports the folder and asks whether to open a pull request to the original. A PR from the shared fork includes **all** unmerged changes in the fork.

**The fork is never deleted**; it is reused for every story. The original collection is never changed by the agent.

Run a folder by hand:

```
node api-run.mjs qa "https://qa1.maximizercrmlive.com/web12715wme/<database id>" ^
  --collection 34291118-70db2f8a-2142-47ca-a9b4-e1ad6326437d ^
  --folder "AbEntry/AB#186076" --api-base https://qa1.maximizercrmlive.com/api12715wme
```

Add `--dry-run` to see what would run, `--base-env <environment uid>` to start from an existing Postman environment, or `--out <folder>` to choose the report folder.

### 4.3 Both

API tests run first, then UI tests, on the same build and user, with one combined summary.

---

## 5. Example prompts

Type these in Claude Code (inside this folder). Replace the IDs with your own. You can always add details in plain words — the agent asks when something is unclear.

### 5.1 Start of the day

```
Check the setup and tell me if anything is missing
```
```
Which stories are assigned to me?
```
```
Run today's QA workflow
```
```
List my items in To test Branch and Testing Branch, newest first, and tell me which are UI, API or Both
```

### 5.2 One work item (UI)

```
Test 193170
```
```
Read 193170 and write acceptance criteria and test cases. Don't run anything yet
```
```
Test 193170 end-to-end
```
```
Test 193170 on Staging as ABROWN
```
```
Test 193170 using this build: https://qa1.maximizercrmlive.com/web12715wme/<database id>
```
```
Run only TC2 and TC4 of 193170
```
```
Re-run the failed test cases of 193170
```

### 5.3 Reviewing and changing test cases

```
Add a negative test case for an empty company name
```
```
Merge TC3 and TC4 into one test case
```
```
TC2 step 3 is wrong — the button is called "Copy Link", not "Share". Update it
```
```
Looks good, push these test cases to ADO
```
```
Which test cases already exist in suite 193170? Don't create duplicates
```

### 5.4 API testing

```
/api-story 186076
```
```
/api-story 186076 — the API base URL is https://staging1.maximizercrmlive.com/api2025M9
```
```
Show me the scenarios and coverage matrix for 186076 before adding anything to Postman
```
```
Add a boundary test for a 255-character CompanyName to AB#186076
```
```
Run the AB#186076 folder again as abrown
```
```
Why did "186076-SQL-Update ReportsToKey to itself (negative)" fail? Is it the test or the product?
```
```
Is the Claude fork behind the original collection?
```
```
Export the AB#186076 folder and open a pull request to the original
```

### 5.5 Both UI and API

```
Test 193177 — Test type: Both
```
```
193177: run the API checks first, then verify the same rights in the Administrator screen
```

### 5.6 Defects and reports

```
Show me the defect drafts from today's run
```
```
File defects 1 and 3 in ADO and link them to 193170
```
```
Is there already an open bug for this failure on 193170?
```
```
Give me today's summary: pass, fail, blocked, and whether rights were restored
```
```
Open today's run log
```

### 5.7 Users, rights and clean-up

```
Before testing 193169, give ABROWN Read + Insert on Action Plan Library / Workflow Templates
```
```
What rights did you change today, and are they restored?
```
```
Delete the QA_AUTO test data you created for 193170
```

### 5.8 Prompts to avoid

| Instead of | Say |
|---|---|
| "Here is the password: …" | Nothing — passwords belong only in `.env` |
| "Test on production" | Not supported — only QA and Staging hosts from `.env` |
| "Change MASTER's rights" | Use a non-admin test user (ABROWN / STAGING_NONADMIN) |
| "Delete the fork" / "Make a new fork" | Blocked by design — the Claude fork is reused for every story |
| "Just mark it as passed" | The agent only reports what actually ran |

---

## 6. Results and evidence

| Status | Meaning |
|---|---|
| **Pass** | Every expected result observed |
| **Fail** | The product behaved differently (reproduced after one retry) — gets a defect draft |
| **Blocked** | Environment, login, test user, data or tool problem — not a product defect |
| **Not Run** | Skipped by scope or decision |
| **Needs Clarification** | Test case has no or unclear steps; the agent proposes steps |

- UI evidence: `screenshots/<ID>-<TC#>-<name>.png`
- API evidence: `api-results/AB#<ID>/run-<n>/summary.md`, `summary.json`, `junit.xml` (passwords and tokens removed)
- Daily log: `runs/<YYYY-MM-DD>/run.md`

The end-of-run summary shows counts per status, test case IDs, defects, deferred checks, and whether **rights were restored** and **test data was cleaned up**.

---

## 7. Safety rules built in

- **Compliance:** only QA/Staging test databases. If tenant or household/end-client data appears, the agent stops and shows the compliance alert (report to itna@maximizer.com).
- **Secrets:** Claude Code can't read `.env`; scripts read it and never print values.
- **Asks first:** creating ADO test cases or bugs, changing user rights, deleting data, confirming destructive dialogs, Postman merge/overwrite/pull-request/pull actions.
- **Blocked outright:** deleting Postman collections, creating new forks.
- **Never touched:** MASTER's rights, the original Postman collection, other stories' folders in the fork.
- Rights changed for a test are recorded and **restored at the end**, even after failures. Created data is prefixed `QA_AUTO_<ID>_` and cleaned up.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `check-setup.mjs` says NOT READY | Fix the `FAIL` lines (missing `.env` keys, `npm install`, missing files) |
| `switch-user.mjs` exit **1** | Missing `<NAME>_URL/_USERNAME/_PASSWORD` in `.env`, or bad URL |
| `switch-user.mjs` exit **2** | Login rejected — wrong password, or that user doesn't exist on this build (test marked Blocked) |
| `switch-user.mjs` exit **4** | Browser not open yet — any Playwright step opens it; check the `--config` in the Playwright MCP |
| exit **5** (either script) | The URL's host isn't in `.env` — add it if it's a test server |
| `api-run.mjs` exit **3** | Some tests failed — see `summary.md` |
| `api-run.mjs` exit **4** | Folder not found or name used twice — pass the full path, e.g. `AbEntry/AB#186076` |
| `api-run.mjs` exit **6 / 7** | Postman API problem (key/network) / Newman missing (`npm install`) |
| Every API request fails auth | Wrong API base URL (e.g. Staging `web2026M11` uses `api2025M9`) — confirm it |
| ADO asks to pick an account each time | Use the Azure CLI sign-in (section 2.3) |
| Postman connector times out on the collection | Normal for this size; the agent reads folder by folder or the local export |
| Screenshots in the wrong place | They are moved to `screenshots/` automatically; check the Playwright MCP uses `--config` |

---

## 9. Maintenance

- **Add a user or server:** add `<NAME>_URL`, `<NAME>_USERNAME`, `<NAME>_PASSWORD` to `.env`, then add the name to the tables in `CLAUDE.md` ("Test environment", "Test user").
- **Change which ADO states are picked up:** `CLAUDE.md` → "Step 1".
- **Refresh the local collection export:** Postman → collection → ⋯ → Export (v2.1) → overwrite `api/collections/RegressionSuite-Octopus-API-Complete.json`.
- **Update API conventions:** edit `api/collections/conventions.md` (e.g. after reviewing more folders).
- **Restore an older version:** copies are in `.backup-2026-11-19/`.
