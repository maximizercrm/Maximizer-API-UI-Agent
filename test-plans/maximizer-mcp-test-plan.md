# Maximizer MCP Server — Test Plan

| | |
|---|---|
| **Product** | Maximizer MCP server (`maximizer-mcp`) and Auth Gateway (`maximizer-auth`) |
| **Under test** | 41 tools, served identically by the `qa` and `local` servers |
| **First target build** | MCP 1.7.0, Auth gateway 0.4.0 (story 194280) |
| **Environment** | QA: MCP `https://mcp-qa.maximizer.com/mcp`, gateway `https://auth-qa.maximizer.com/v1` |
| **Related stories** | 179746 Maximizer OAuth · 183938 MCP OAuth · 183934 AUM tool · 189435 Remove PAT in production · 194280 Usage logging and dashboard |
| **Owner** | Rahul Pandita |
| **Status** | Draft for review |

## 1. Objectives

1. Every tool does what its description says, returns data that matches the CRM, and never returns a wrong answer that looks right.
2. Access control holds: a caller sees and changes only what the signed-in user's rights allow, whatever the kind of token.
3. Errors are clear, safe (no stack traces, tokens or customer data) and consistent.
4. Write tools change exactly one thing, and what they change can be undone or cleaned up.
5. Sign-in (OAuth, PAT, session) works for each client kind and PATs are refused where they should be.
6. Usage logging (194280) is complete, accurate and free of customer data.

## 2. Scope

**In scope:** all 41 tools (section 5), authentication and authorization of the MCP endpoint, error handling, performance and limits, logging (194280).

**Out of scope:** AI-client behaviour (how Claude, Gemini or Copilot use the tools), CRM UI testing except to confirm data, the production endpoint (PAT refusal in production is verified by the story owner, not from QA), DataHub internals beyond the tool contracts.

## 3. Compliance and safety rules (non-negotiable)

- Test only on QA or Staging databases with seeded records. Never copy, screenshot or log tenant or household data from a customer database. If any appears, stop and issue the compliance alert.
- Never place tokens, PATs or passwords in test cases, ADO, run logs, screenshots or chat. Credentials come from `.env` or the user.
- Name every record created `QA_AUTO_<caseId>_<time>` and record its id in the run log.
- Only two delete tools exist (`note_delete`, `task_delete`). Appointments, documents, e-mails and sent messages cannot be removed by the tools, so keep these cases few, use one dedicated QA record, and agree clean-up with the owner before running them.
- `abentry_update` and `lead_update` are restored by writing the original values back. Record "before" values first and re-read to confirm.
- `email_send` sends real mail. Send only to a QA mailbox the owner nominates, never to an external address, and run it once per scenario.
- Ask before: any write that cannot be undone, changing a user's rights, or changing an environment setting.

## 4. Approach

| Level | What | How |
|---|---|---|
| Contract | Each tool: valid call, required and optional arguments, response shape, error shape | Call tools through the connected `Maximizer MCP qa` tools, or raw MCP requests with a PAT |
| Data accuracy | Results equal what the CRM shows | Compare with the UI (Playwright) or a second read tool (for example `record_get` against `contact_read`) |
| Security | Auth kinds, rights, tenant isolation, refused calls | OAuth session, PAT, session token, a low-rights user (ABROWN), a token for another tenant |
| Negative | Bad ids, bad fields, missing arguments, oversized input | Direct calls |
| Write safety | One change, correct fields, undo works | Before/after reads |
| Non-functional | Latency, paging, large results | Time calls, request more than 100 rows |
| Observability | 194280 events for every call | Marked calls, then KQL checks (section 8) |

**Test users and tokens:** MASTER (admin) and ABROWN (non-admin) on the QA tenant; an OAuth session (via Claude or the consent page); a PAT (allowed on QA); a CRM session token; an application token for `AppId` checks. A tenant that has no MCP access is needed for the refused cases.

**Test type for every case:** API/MCP. Playwright is used only to confirm data in the CRM or to run the consent flow.

## 5. Coverage by tool group

Each case below is written as "Verify that…". Priority: **P1** blocks release, **P2** important, **P3** nice to have.

### 5.1 Cross-cutting cases (apply to every tool)

Run these as a short matrix against every tool in groups 5.2 to 5.10, marking each cell, rather than as separate cases.

| ID | Case | P |
|---|---|---|
| X1 | A valid call returns the documented shape, with ids, names and fields that match the CRM | P1 |
| X2 | A call with a missing required argument is rejected with a clear validation message and no data | P1 |
| X3 | A call with an unknown or malformed id returns a "not found" or validation error, not an empty success and not a server error | P1 |
| X4 | A caller without the right to see a record gets a refusal, and no field of that record appears anywhere in the reply | P1 |
| X5 | Errors contain no stack trace, token, connection string or other customer's data | P1 |
| X6 | A call with the OAuth session, a PAT and a session token behaves identically (apart from the log field `TokenKind`) | P1 |
| X7 | Results over the page limit are paged or reported as truncated, and never silently cut | P1 |
| X8 | Special characters, accents (French data is present on QA) and very long text round-trip without damage | P2 |
| X9 | Response time for a typical call is under the agreed limit (set with the owner; suggest 3 s for reads) | P2 |
| X10 | The same call twice returns the same data (reads are repeatable and have no side effects) | P2 |
| X11 | The call produces exactly one usage event with the right dimensions (see section 8) | P1 |

### 5.2 Address book (abentry_read, company_read, contact_read, household_read)

| ID | Case | P |
|---|---|---|
| AB1 | `abentry_read` returns a company, an individual and a contact record with the same field values as the CRM UI | P1 |
| AB2 | `company_read` lists companies, supports search by name and filters, and returns the same count as the CRM list | P1 |
| AB3 | `contact_read` returns the contacts of a company and links each to the right company | P1 |
| AB4 | `household_read` returns the household with all members, and a member's change in the CRM shows on the next read | P1 |
| AB5 | Reading a record the user has no right to (access-rights restricted) is refused | P1 |
| AB6 | Search with accents and partial names finds the expected records, and a search with no match returns an empty list, not an error | P2 |
| AB7 | UDF (user-defined field) values are returned with the right type, including date, number, yes/no and table fields | P2 |
| AB8 | A list larger than one page can be read completely, with no duplicates and no gaps | P1 |

### 5.3 Sales (lead_read, opportunity_read)

| ID | Case | P |
|---|---|---|
| SA1 | `lead_read` returns leads with status, owner and campaign matching the CRM | P1 |
| SA2 | `opportunity_read` returns stage, status, revenue, close date, owner and linked entries matching the CRM | P1 |
| SA3 | Filters by owner, stage and status return only matching records and the count equals the CRM | P2 |
| SA4 | An opportunity linked to a restricted company is hidden or refused for a user without rights | P1 |
| SA5 | Converted and archived leads are shown or excluded as documented | P3 |

### 5.4 Activities (appointment_read, task_read, note_read, interaction_read, timeline_read)

| ID | Case | P |
|---|---|---|
| AC1 | `appointment_read` returns appointments for a date range with correct start, end, attendees and time zone | P1 |
| AC2 | `task_read` returns open and completed tasks with due dates, assignee and linked entries | P1 |
| AC3 | `note_read` returns note text and date unchanged, including formatting and accents | P1 |
| AC4 | `interaction_read` returns logged calls, e-mails and meetings with direction, result and category | P1 |
| AC5 | `timeline_read` returns the cross-channel feed in correct order and with the same items as the CRM Timeline tab | P1 |
| AC6 | Private notes and activities of another user are not returned to a user without access | P1 |
| AC7 | Date-range filters include the boundary days and respect the user's time zone | P2 |
| AC8 | A record with no activity returns an empty list, not an error | P2 |

### 5.5 Users and documents (user_read, document_list, document_read, documentlibrary_list, record_get)

| ID | Case | P |
|---|---|---|
| UD1 | `user_read` returns user names, ids and status, and never returns passwords, tokens or secrets | P1 |
| UD2 | `document_list` and `documentlibrary_list` list the documents and libraries the user may see, with names, types and sizes | P1 |
| UD3 | `document_read` returns the content of a text document and a safe response for a binary or very large one | P1 |
| UD4 | A document in a restricted library or record is refused for a user without rights | P1 |
| UD5 | `record_get` returns all fields for a company, a contact, a lead and an opportunity, and equals the union of the specific read tools | P1 |
| UD6 | `record_get` with the wrong record type for an id returns a clear error | P2 |

### 5.6 Create (task_create, note_create, appointment_create, document_create, email_send)

Run each case on one seeded QA record, record the new id, then clean up as noted.

| ID | Case | Clean-up | P |
|---|---|---|---|
| CR1 | `task_create` creates one task with the right subject, due date, assignee and link; it appears in the CRM and in `task_read` | `task_delete` | P1 |
| CR2 | `note_create` creates one note on the right record with exact text (accents, line breaks, 5,000 characters) | `note_delete` | P1 |
| CR3 | `appointment_create` creates one appointment with correct start, end, attendees and time zone | Manual delete in the CRM, owner approval | P1 |
| CR4 | `document_create` attaches a small file to a record with the right name and size; it opens in the CRM | Manual delete, owner approval | P2 |
| CR5 | `email_send` sends one e-mail to the nominated QA mailbox with the right subject, body and sender, and logs an interaction | Cannot be undone | P2 |
| CR6 | Each create tool rejects missing required fields and invalid values, and creates nothing | n/a | P1 |
| CR7 | Each create tool refuses a user without insert right, and creates nothing | n/a | P1 |
| CR8 | Calling the same create twice creates two items (no hidden de-duplication), and a failed call creates none | task/note delete | P2 |
| CR9 | Created items are audited with the signed-in user, not a service account | n/a | P2 |
| CR10 | `email_send` cannot be pointed at an unapproved address in QA (confirm the policy with the owner) | n/a | P1 |

### 5.7 Update (abentry_update, lead_update, task_update)

| ID | Case | P |
|---|---|---|
| UP1 | `abentry_update` changes one field on a company, an individual and a contact and leaves all other fields unchanged | P1 |
| UP2 | `lead_update` changes one field and leaves the rest unchanged | P1 |
| UP3 | `task_update` changes the due date, assignee and completion and leaves the rest unchanged | P1 |
| UP4 | Writing the original values back restores the record exactly (read before and after) | P1 |
| UP5 | An update with an invalid value (wrong type, a value outside a table field's list, text too long) is rejected and nothing changes | P1 |
| UP6 | An update by a user with no modify right is refused and nothing changes | P1 |
| UP7 | An update to a record deleted or changed by someone else returns a clear error or applies the documented rule (no silent overwrite) | P2 |
| UP8 | An update that clears a field (empty value) behaves as documented and does not clear other fields | P2 |

### 5.8 Delete (note_delete, task_delete)

| ID | Case | P |
|---|---|---|
| DE1 | `note_delete` deletes only the named note, and it no longer appears in the CRM or in `note_read` | P1 |
| DE2 | `task_delete` deletes only the named task | P1 |
| DE3 | Deleting an id that does not exist, or that was already deleted, returns a clear error and deletes nothing | P1 |
| DE4 | A user without the delete right is refused (the newest QA users have delete off by default), and the item remains | P1 |
| DE5 | Deleting an item that does not belong to the caller's tenant is impossible | P1 |

### 5.9 Schema and metadata (schema_get_fields, schema_find_fields, schema_get_field_details, schema_get_field_options, system_get_vertical)

| ID | Case | P |
|---|---|---|
| SC1 | `schema_get_fields` returns every field for each object with the right type, and includes UDFs | P1 |
| SC2 | `schema_find_fields` finds fields by partial and accented name and returns none for a missing name | P2 |
| SC3 | `schema_get_field_details` returns type, length, mandatory and read-only flags equal to the CRM settings | P1 |
| SC4 | `schema_get_field_options` returns the values of a table field in the same order as the CRM | P1 |
| SC5 | A new UDF or table value added in the CRM appears in the schema tools on the next call (no stale cache) | P2 |
| SC6 | `system_get_vertical` returns the vertical the QA database is configured for | P2 |
| SC7 | Schema tools do not expose fields the user may not see | P1 |

### 5.10 Insurance and investments (DataHub)

| ID | Case | P |
|---|---|---|
| IN1 | `insurance_policy_read` returns the policy fields, owners and beneficiaries for a seeded policy, and they match the source | P1 |
| IN2 | `insurance_household_policies` lists every policy of a household, including those held by its members, with none missing | P1 |
| IN3 | `insurance_household_coverage` totals the coverage correctly and states how a missing value is treated | P1 |
| IV1 | `investments_account_read` returns the account fields, holdings and values matching the source | P1 |
| IV2 | `investments_account_diagnostics` reports data problems (missing values, stale dates) accurately for a good and a deliberately incomplete account | P2 |
| IV3 | `investments_allocation_schema` returns the allocation categories and they are the ones used by `investments_household_allocation` | P2 |
| IV4 | `investments_household_aum` returns an AUM total and a ranking equal to a manual sum of the household's accounts and its members' accounts | P1 |
| IV5 | `investments_household_aum` counts accounts held by the household and by each member, and none are missed or counted twice | P1 |
| IV6 | `investments_household_aum` with more than 100 rows (grouped reads) returns every household, not a cut-off list | P1 |
| IV7 | `investments_household_aum`: an empty sum is shown as no value, never as $0, and a missing value is reported as missing (story 183934) | P1 |
| IV8 | `investments_household_aum`: if any part of the data fails to load, the tool returns an error and never a partial number (story 183934); fault injection with the story owner | P1 |
| IV9 | `investments_household_allocation` percentages add up to 100% and match the holdings | P1 |
| IV10 | `investments_household_risk_profile` returns the profile for a seeded household and a clear "not available" for one without a profile | P2 |
| IV11 | `investments_household_book_scan` runs across all households within the time limit, and its totals equal the sum of the household results | P1 |
| IV12 | DataHub tools refuse a tenant without the DataHub integration, with a clear message | P2 |

## 6. Authentication and authorization (stories 179746, 183938, 189435)

| ID | Case | P |
|---|---|---|
| AU1 | A request with no token gets `401` and a `WWW-Authenticate` header that points to the resource metadata (done on QA, build 1.7.0) | P1 |
| AU2 | The protected-resource metadata (RFC 9728) names the gateway, and the gateway metadata (RFC 8414) has authorize and token endpoints, `S256` and CIMD support (done on QA) | P1 |
| AU3 | A full OAuth sign-in with a URL-shaped client id (CIMD, for example Claude) shows the consent page, completes, and the issued token calls a tool | P1 |
| AU4 | A client id from a domain that is not on the allowlist is rejected | P1 |
| AU5 | PKCE: a flow using `plain`, or with a wrong verifier, is rejected | P1 |
| AU6 | A token refresh returns a new access token and the old refresh token's behaviour matches the policy | P1 |
| AU7 | An expired, tampered or other-environment token is rejected with `401`, not a server error | P1 |
| AU8 | A PAT in `Authorization: Bearer` works on QA, and `AllowPersonalAccessTokens=false` refuses it with `401` and the OAuth challenge (the setting is changed only with the owner; production is verified by the owner) | P1 |
| AU9 | A CRM session token works and acts as that user | P1 |
| AU10 | A token for tenant A cannot read or change tenant B's data (change the workspace id or record id) | P1 |
| AU11 | A tenant that has no MCP access (or is below M7) is refused | P2 |
| AU12 | A user disabled in the CRM can no longer call tools, even with an unexpired token | P1 |
| AU13 | A user whose rights are changed (for example delete turned off) sees the change on the next call | P2 |

## 7. Non-functional

| ID | Case | P |
|---|---|---|
| NF1 | Latency: p50 and p95 for a read, a write and a DataHub tool under agreed limits, measured over 20 calls each | P2 |
| NF2 | 10 concurrent reads return correct and distinct results with no mixing between users | P1 |
| NF3 | Rate or size limits (if any) return a clear error, not a hang | P2 |
| NF4 | A response over the size limit is truncated with a clear marker | P2 |
| NF5 | The server recovers after an upstream timeout (the next call works) | P2 |

## 8. Usage logging and dashboard (story 194280)

Verified with marked calls and KQL run by the story owner or QA in Application Insights (no Azure access from the test tool). Every call carries a unique marker and a time window.

| ID | Case | P |
|---|---|---|
| LG1 | Each log line carries `WorkspaceId`, `UserId`, `TokenKind` (`oauth`) for an OAuth session | P1 |
| LG2 | `TokenKind` is `pat` for a PAT and `session` for a CRM session token | P1 |
| LG3 | `AppId` appears only when the token belongs to an application | P1 |
| LG4 | Exactly one event per tool call for all 41 tools, including the 12 that did not log before | P1 |
| LG5 | Each event has `ToolName`, `Object`, `Outcome`, `DurationMs`, tenant name and alias | P1 |
| LG6 | A failed call logs `Outcome=error`, a refused call `refused`, and neither leaks arguments | P1 |
| LG7 | A client-connect event records the client name and version | P2 |
| LG8 | Gateway events: sign-in started, completed, failed (reason from the fixed list), token issued, token refreshed, with client, tenant id and name, and user | P1 |
| LG9 | No tool arguments, search text or results appear in any event (unique marker is never found) | P1 |
| LG10 | Sampling is off: N calls produce exactly N events | P1 |
| LG11 | The workbook shows overview, tenants and users, tools, sign-ins, and external against internal use by token kind, and the counts match LG4 | P2 |
| LG12 | Logging never changes a tool result or adds noticeable delay (compare DurationMs and response with the pre-194280 baseline) | P2 |

## 9. Test data

- QA database `IQ Boost FAE` seeded households (the Cameron, Hartfield and other families), companies, opportunities, tasks and notes. Use only seeded records.
- One dedicated test company and contact for write cases (`QA_AUTO_MCP_*`).
- At least one household with accounts on both the household and a member (IV5), one with more than 100 grouped rows or a synthetic equivalent (IV6), one with no accounts (IV7), and one policy with several beneficiaries (IN1).
- A restricted record and a restricted document library for the access-rights cases.

## 10. Entry and exit criteria

**Entry:** the build is deployed to QA, the QA MCP and gateway answer the tokenless preflight, test users and tokens are available, and the owner has approved the write and clean-up rules.

**Exit:** every P1 case has Pass or an agreed Blocked reason, no open Critical or High defect, all created records are cleaned or listed, and the run log and defects are in ADO.

**Suspension:** compliance alert raised, QA database corrupted by a failed write, or the environment is down for more than a working day.

## 11. Defects

Severity: **Critical** is data loss, cross-tenant access, or a secret exposed. **High** is a wrong answer that looks right, or a blocked core tool. **Medium** is a wrong behaviour with a workaround. **Low** is wording or cosmetics. Search for a similar open Bug first. Ask before filing each one.

## 12. Deliverables and schedule

Run log per run (`runs/<date>/run.md`), test cases in ADO Test Plan 193161 under one suite per story, a Pass/Fail report per group, the defect list, and a clean-up list. Suggested order: authentication (section 6), then read tools, then DataHub, then write and delete, then logging (section 8), then non-functional.

## 13. Risks and open questions

| # | Risk or question | Impact |
|---|---|---|
| 1 | Appointments, documents and sent e-mails cannot be deleted by the tools | QA clutter and real mail. Needs an agreed mailbox and manual clean-up |
| 2 | No Azure access from the test tool | Logging cases need a person to run KQL |
| 3 | A session token and an application token are needed for `session` and `AppId` | Cases are Blocked without them |
| 4 | The QA tenant may not have enough accounts for IV5 to IV7 | Seed or ask the DataHub owner |
| 5 | PAT refusal in production cannot be tested from QA | The owner verifies it in production |
| 6 | Latency limits are not defined | Agree the limits for NF1 |
| 7 | The cross-tenant check (AU10) needs a second tenant | Use a second seeded QA tenant if one exists |
| 8 | Is there a read-only or scoped token kind? | If so, add cases for scope enforcement |

## 14. Estimated size

113 cases: cross-cutting 11 (run as a matrix over the 41 tools, so many more cells), tool groups 72, authentication 13, non-functional 5, logging 12. Suggested first pass: all P1 cases.
