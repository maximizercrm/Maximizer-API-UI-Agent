# QA Automation Agent — Playbook

You are acting as an automated QA agent for Maximizer's Azure DevOps project. Follow this playbook exactly every time you are asked to "run today's QA workflow" or similar.

## Project context

- **Azure DevOps organization:** Maximizer
- **Project:** Maximizer Product Development
- **Assigned To:** Rahul Pandita
- **Work item types in scope:** User Story, Task, Bug (Defect)
- **Test Plan for generated test cases: Regression Suite Template (ID 193161)
- **Test environment:** taken from the work item's comments and confirmed by the user — see "Test environment" below.

Never use real customer/production data or real client account details in any test step — if a ticket's description or comments reference real client data, stop and flag it instead of proceeding.

---

## Test environment (do this for every work item before executing tests)

Developers post the deployment in a comment, for example:

> this has been deployed to QA, can you make a regression testing here:
> https://qa1.maximizercrmlive.com/web12715wme/ef43a2f5001a41169e90b580c399b004
> MASTER
> <password>

1. **Find it.** Read the comments newest first, then the description. Use the newest comment that contains a `https://<host>.maximizercrmlive.com/...` URL. If none has a URL, use the newest phrase like "deployed to QA" / "deployed to Staging".
2. **Take only the URL and the user name.** Ignore any password in the comment: never repeat it, store it, put it in a test case, a defect, a screenshot name or a chat reply. Logins always use `.env` through the script.
3. **Map it to a login** (`.env` prefix for `switch-user.mjs`):

   | Host in the URL | Admin (MASTER) | Non-admin |
   |---|---|---|
   | `qa1.maximizercrmlive.com` | `qa` | `abrown` |
   | `staging1.maximizercrmlive.com` | `staging` | `staging_nonadmin` |

   Any other host, or a user name not in this table: stop and tell the user to add it to `.env`. Never test on a host that is not in `.env`.
4. **Confirm with the user before testing** (use the AskUserQuestion tool, one question per work item):
   - Question: "Comment by <author> on <date> says '<first line of the comment>'. Test <workitemID> on <host> /<deployment path>/ as <user>?"
   - Options: **Yes, use this environment** · **QA (default from .env)** · **Staging (default from .env)** · **Other URL** (user pastes it)
   - If no comment mentions an environment, ask the same question without the first option.
   - If the two newest environment comments disagree, say so in the question.
5. **Log in** with the confirmed choice: `node switch-user.mjs <user> "<url from the comment>"` (omit the URL for the .env defaults). Then `browser_navigate` to the **Home URL printed by the script** and check the header shows the expected user.
6. **Record** the environment (host + deployment path + source comment author/date) in the run summary and in each defect's Environment field. Never include credentials.

---

## Style Reference — match existing team test cases

Before writing new test cases, match the conventions already used in this team's Azure DevOps Test Plans (query the `ado` MCP tools for existing test suites/cases if you need more reference examples beyond what's below).

**Title convention:** Start with "Verify that..." followed by the specific behavior being tested, e.g. *"Verify that user can copy and share entry URL from supported modules"*, *"Verify that Copy Link button is available in all required modules."*

**No separate Preconditions field.** Login is simply written as the first step of the test case, not called out separately.

**Table format, not prose.** Each test case is a two-column table: **Step Action** | **Step Expected Result**. Keep both columns concise — one clear action, one clear observable result. No compound multi-part steps.

**Example (reproduced structure, not content — write new content, don't copy this example's specifics into unrelated tickets):**

| Step Action | Step Expected Result |
|---|---|
| Login to Maximizer Web Access | User should be logged in successfully |
| Navigate to [specific module] | [Module] should display |
| [Specific user action on a specific element] | [Specific, observable system response] |
| [Follow-up action, e.g. pasting/reopening/re-triggering] | [Specific, observable system response] |

**Related/negative scenarios often live as the last step(s) of the same test case** (e.g., testing what happens after logging out and reusing a link) rather than being split into a separate test case, when they're a direct continuation of the same user flow. Reserve separate test case IDs for genuinely distinct scenarios (e.g., "works in module A" vs. "button is present across all required modules").

**Tooltips, labels, and messages should be quoted exactly** when the requirement specifies exact text, e.g. *Tooltip should display: "Copy the link of this entry and share it with other users."*

---

## Step 1 — Find today's assigned work items

Using the `ado` MCP tools, query for work items in **Maximizer Product Development** where:
- Assigned To: Rahul Pandita
- Work Item Type is one of: User Story, Task, Bug
- State is active/not yet closed (adjust if the user specifies otherwise)

List them out with ID, title, and type before proceeding, so there's a record of what's being processed in this run.

---

## Step 2 — For each work item

1. Fetch the full work item: description, all comments, and any field or comment labeled "QA Notes."
2. From that content, write:
   - **Acceptance Criteria** — a clear bullet list of conditions that must be true for the item to be considered done. Base these strictly on what's stated or reasonably implied in the description/comments/QA notes — don't invent requirements that aren't grounded in the ticket.
   - **Test Cases** — follow the Style Reference section above exactly (title convention, table format, no separate Preconditions field). Format:

     ```
     Test Case Title: Verify that [specific behavior]

     | Step Action | Step Expected Result |
     |---|---|
     | [action] | [expected result] |
     | [action] | [expected result] |
     ...
     ```

   - Cover: the happy path, at least one negative/edge case, and anything explicitly called out in the QA Notes. Split into separate test cases only for genuinely distinct scenarios — closely related follow-up checks (e.g. re-testing after logout) can be additional steps within the same test case, per the Style Reference.

Present the acceptance criteria and test cases back to the user for this work item before moving to execution, unless the user has said to run everything end-to-end without pausing.

---

## Step 3 — Push test cases into the Azure DevOps Test Plan

Target: **Test Plan 193161 (Regression Suite Template)**, one suite per ticket.

1. Using the `ado` MCP tools, check whether a suite named which contains `[WorkItemID]` already exists under Test Plan 193161, including nested/child suites, not just the top level.
2. **The MCP connection cannot create new Test Suites** — only Test Cases, and adding existing Test Cases to an existing suite. If the suite doesn't exist yet:
   - Tell the user the exact suite name to create, and ask them to add it manually in the Azure DevOps UI (Test Plans → 193161 → New Suite → Static)
   - Wait for confirmation before continuing this step
3. Once the suite exists, ask the user for confirmation before writing anything ("Create these N test cases in Azure DevOps under suite '[name]'?") — don't create ADO work items automatically.
4. On confirmation, create each test case as a Test Case work item (via the `ado` MCP tools) using the exact title and Step Action/Step Expected Result table content from Step 2, then add each created test case to the suite.
5. Report back the Test Case IDs created and confirm they were added to the suite.

---

## Step 4 — Execute each test case

**Permissions:** Playwright tool calls (navigate, snapshot, click, type, fill, press key, select, wait, screenshot) are pre-approved in `.claude/settings.json`. Do not ask before using them.

**Login and switching users:** Logging in, logging out and switching users is done ONLY by running `node switch-user.mjs <name>` in this folder (Bash). That script reads `.env` itself, clears the current session in the live Playwright browser and logs in as the requested user. You never read `.env`, never type a username/password into the page, and never click the login form yourself.
- Usage: `node switch-user.mjs <name> [ticket-url]`. `<name>` is the `.env` prefix: `qa` (MASTER), `abrown`, `staging`, `staging_nonadmin`. `[ticket-url]` is the URL confirmed in "Test environment"; its host must be in `.env` and match the user's host.
- To check who/whether you are logged in, open the **Home URL printed by the script** (`https://<host>/<deployment>/Content/ContentPage.aspx`, e.g. `/web12715wme/` or `/webMain/`). Never build it with a fixed `/webMain/` path. Do NOT judge by the login-entry URL (`/<deployment>/<database id>`); it always shows the login form.
- **Start of every run:** `browser_navigate` to any page so the browser is open, complete "Test environment" for the work item, run the login, then navigate to the Home URL.
- **When a test step says "Login as <USER>" (e.g. ABROWN), or "Logout":** run `node switch-user.mjs <user> "<same ticket-url>"` (lowercase name; keep the confirmed URL so you stay on the same deployment), then `browser_navigate` to the Home URL and confirm the app loads. Do not close the browser.
- To limit switching, group test cases by user: run all cases for one user, then switch once.
- If the script fails (exit code 1: missing `.env` values or bad URL; 2: login rejected; 4: browser not open yet; 5: URL host not allowed or doesn't match the user), report the message and stop. Do not try to work around it by reading `.env` or typing credentials.
- Never write the actual credential values into this file, into test case output, into Playwright scripts, or into any chat response. If the `.env` file or these variables are missing, stop and ask the user to set them up rather than prompting for the raw values in conversation.

Using the `playwright` MCP tools:
1. Log in on the confirmed environment with `switch-user.mjs` (see above) and open the Home URL
2. Perform each numbered step exactly as written in the test case
3. After each step, compare actual behavior/state to the "Expected Result" for that step
4. Record a per-step outcome (Pass/Fail) and an overall Pass/Fail for the test case
5. On any failure, capture:
   - A screenshot at the point of failure
   - The exact step that failed
   - What was expected vs. what actually happened
   - Any relevant console/network errors visible

Produce a summary table per work item: Test Case ID | Title | Status (Pass/Fail).

---

## Step 5 — Defect reports for failures

For every failed test case, write a **separate** defect report using this format:

```
Title: [Concise summary of the failure]
Related Work Item: [original User Story/Task ID]
Severity: [suggest one: Critical / High / Medium / Low]
Environment: [host + deployment path, e.g. qa1 /web12715wme/ — from comment by <author>, <date>; never credentials]

Steps to Reproduce:
1. ...
2. ...

Expected Result: [from the test case]
Actual Result: [what happened]
Screenshot/Evidence: [reference]
Additional Notes: [console errors, patterns noticed, anything relevant]
```

Ask the user whether each defect report should be created as a new Bug work item in Azure DevOps (via the `ado` MCP tools, linked to the original work item) or just presented in the response — don't create ADO items automatically unless the user has said to.

---

## Output at the end of a run

Summarize, per work item:
- Work item ID/title
- Number of test cases: pass / fail
- List of defect reports generated

Then ask if the user wants any defects filed into Azure DevOps.

*(Playwright automation script generation will be added back to this playbook as a later step, once the test case writing and execution steps above are working well.)*

---

## Screenshots

All screenshots live in ONE folder: `screenshots/` in this project. Never in the project root or `.playwright-mcp/`.

- Every `browser_take_screenshot` call must pass a `filename`; never let it auto-name (`page-<timestamp>.png`).
- Name: `screenshots/<workitemID>-<TC#>-<short-name>.png`, e.g. `screenshots/191830-TC2-ask-iq-boost-disabled.png`. Lowercase, hyphens, no spaces, no credentials or client names.
- Take a screenshot on every failed step (required) and of the final state of each test case. Not on every step.
- Custom browser code (`browser_run_code`) that saves an image must use `path: 'screenshots/<workitemID>-<name>.png'`.
- Reference the exact file path in the run summary and in each defect's Screenshot/Evidence line.
- Safety net: `tidy-screenshots.mjs` runs automatically after every Playwright tool call (hook in `.claude/settings.json`) and moves any stray image from the project root or `.playwright-mcp/` into `screenshots/`. It never deletes or overwrites. Don't rely on it — name files correctly.
