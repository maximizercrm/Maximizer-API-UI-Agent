# RegressionSuite-Octopus API(Complete) — conventions for new tests

Source: analysis of the exported collection (`RegressionSuite-Octopus-API-Complete.json`, 19 Nov 2026), folders **Authenticate** and **AbEntry**.
Size: 68 root folders, 835 folders, 7,155 requests, 621 collection variables. Re-check other folders before relying on these rules for them.

`/api-story` must follow this file. Where this file says **New tests:**, it deliberately differs from older requests.

---

## 1. Collection-level behaviour (applies to every request)

- **Auth:** collection auth = `Bearer {{Token}}`. The collection pre-request auto-login script is **commented out**, so a run must start with **Authenticate → Get Token** (`api-run.mjs` adds it automatically before the story folder).
- **Get Token:** `POST {{BaseURL}}/Data.svc/json/Authenticate`, body `Database / UID / Password / VendorId / AppKey` from variables; its test saves `pm.environment.set("Token", jsonData.Data.Token)`.
- **Collection test script** runs after every request and asserts:
  1. `Status Code is 200` — skipped only for request names in `skipRequestsforStausCode` (currently `Verify Token`, `Verify Token with Invalid Token`).
  2. `Content-Type contains application/octet-stream` (HTTPS only) — skipped for names in `skipRequestsforContentType` (token checks and `Download … document` requests).
  - Octopus returns **HTTP 200 even for business errors**; errors are in `Code` (≠ 0) and `Msg`. So new negative tests normally still get 200 and need no skip-list change.
  - If a new request genuinely returns non-200 or a non-octet-stream type, its **exact name** must be added to the relevant skip list in the collection test script (fork only, mention it in the PR).
- **Variable reset:** `Authenticate → Read all objects` (pre-request) clears **all** environment and collection variables except `BaseURL, Token, Database, UID, Password, VendorId, AppKey`, and sets `past-date`, `future-date`, `current-date`, `effective-date`. Don't rely on values set before it; don't run it inside a story folder.

## 2. Request format

- **Always** `POST {{BaseURL}}/Data.svc/json/<Method>` with a raw JSON body. Methods seen: `Authenticate`, `TokenValid`, `VerifyToken` (GET), `Create`, `Read`, `Update`, `Delete`. **New tests:** use exact casing `Read` (older requests mix `read`/`Read`).
- No custom headers; no per-request auth (except the invalid-token test).
- **Create / Update / Delete:**
  ```json
  { "AbEntry": { "Data": { "Key": null, "Type": "Company", "CompanyName": "QA_AUTO_AB<ID>_{{$randomCompanyName}}" },
                 "Options": { "ReadAfterSave": true } } }
  ```
  Update/Delete pass `"Key": "{{<KeyVariable>}}"`.
- **Read:**
  ```json
  { "AbEntry": { "Criteria": { "SearchQuery": { "Key": { "$EQ": "{{<KeyVariable>}}" } } },
                 "Scope": { "Fields": { "Key": 1, "Type": 1, "CompanyName": 1 } } } }
  ```
  Operators seen: `$EQ`, `$IN`, `$PHRASE`, `$INBOUND`, `$TREE` (schema). Request only the fields the test checks.
- **SQL vs Legacy driver:** many behaviours are tested twice. SQL version adds
  `"Configuration": { "Drivers": { "IAbEntrySearcher": "Maximizer.Model.Access.Sql.AbEntrySearcher" } }` (reads) or
  `"IAbEntryAccess": "Maximizer.Model.Access.Sql.AbEntryAccess"` (writes); names prefixed `SQL-` / `Legacy-`. If the story concerns data access/search, cover both drivers.
- Other options seen: `"Options": { "IgnoreDefault": true }`, `"Compatibility": { "AbEntryKey": "2.0" }` / `{ "SchemaObject": "1.0" }`, `"Globalization": { "Culture": "$CURRENTUSER()", "TimeZone": "$CURRENTUSER()" }`.
- **Metadata:** `"Schema": { "Criteria": { "SearchQuery": { "Key": { "$TREE": "/AbEntry" } } }, "Scope": { "Fields": { "Key": 1 } } }` → response `Schema.Data[].Key`.
- **Response shapes:** Create/Update → `<Object>.Data` is an **object** (`jsonData.AbEntry.Data.Key`). Read → `<Object>.Data` is an **array** (`jsonData.AbEntry.Data.length`, `jsonData.AbEntry.Data[0].CompanyName`).
- Test data uses Postman dynamic variables (`{{$randomFullName}}`, `{{$randomEmail}}`, `{{$randomPhoneNumber}}`, `{{$randomBoolean}}`…). **New tests:** prefix created names with `QA_AUTO_AB<ID>_` so they can be found and cleaned up; no personal emails or real client data.
- Fixed keys seen (DB-independent, base64): `QWJFbnRyeQlATUFTVEVSCTA=` (MASTER default entry), `VXNlcgkq` (all users), `VXNlcglNQVNURVI=` (MASTER).

## 3. Naming

- Request names: action + object, e.g. `Legacy-CreateCompany`, `SQL-ReadContact`, `DeleteCompany`, `Read Contact1`.
- Story/bug items: ADO ID prefix (`16099-Legacy-Update ReportsToKey property(Type Contact)`) or a folder named by ID (`Bugs/115571`).
- **New tests:** folder `AB#<ID>` under the matching object folder; requests named `<ID>-<SQL-|Legacy-><Action> <what is checked>`, e.g. `186076-SQL-Update ReportsToKey to itself (negative)`. Names must be unique inside the folder (skip lists match by name). No ` Copy` suffixes, no typos.

## 4. Tests (Tests tab)

Standard opening of every request:
```javascript
var jsonData = pm.response.json();

pm.test("Validate Code:0", function () {
    pm.expect(jsonData.Code).to.eql(0);
});
```
Field checks — one `pm.test` per field, named `Check <Field>`:
```javascript
pm.test("Check CompanyName", function () {
    pm.expect(jsonData.AbEntry.Data.CompanyName).to.eql(pm.collectionVariables.get("AB186076_CompanyName"));
});
```
Negative (business error) — exact code plus message text:
```javascript
pm.test("Validate Code:-6", function () {
    pm.expect(jsonData.Code).to.eql(-6);
});
pm.test("Check Response Message", function () {
    pm.expect(pm.response.text()).to.include("cannot be used to associate with ReportsTo field");
});
```
Deleted/absent — `pm.test("Response body should be empty", () => pm.expect(jsonData.AbEntry.Data.length).to.eql(0));`
Field must not appear — `pm.expect(pm.response.text()).not.contains('ParentKey');`
Metadata — `expectedKeys` array + `jsonData.Schema.Data.some(item => item.Key === key)`; one test listing missing keys.

**New tests must also (gaps in older requests):**
- Assert the **path really exists** before comparing values, so `undefined === undefined` can't pass:
  ```javascript
  pm.test("Read returns exactly 1 record", () => pm.expect(jsonData.AbEntry.Data).to.be.an("array").with.lengthOf(1));
  const rec = jsonData.AbEntry.Data[0];
  pm.test("Check CompanyName", () => pm.expect(rec.CompanyName).to.eql(pm.collectionVariables.get("AB186076_CompanyName")));
  ```
- Check types where the story is about data shape: `to.be.a("string")`, `to.be.a("number")`, `to.be.a("boolean")`, `to.be.an("array")`; compare whole objects with `to.eql({...})` or their sub-fields, never an object against a string.
- Never use `pm.globals` (older ReadCompany tests read globals that are never set — they likely pass without checking anything).
- Keep assertions about the requirement; don't add `Status 200`/content-type checks — the collection script already does.

## 5. Variables and chaining

- Older requests chain through **environment** variables (`pm.environment.set("AbEntryCompanyKey", jsonData.AbEntry.Data.Key)`).
- **New tests:** use **collection variables with the story prefix** — `pm.collectionVariables.set("AB186076_CompanyKey", jsonData.AbEntry.Data.Key)` and `{{AB186076_CompanyKey}}` — so they live in the fork, can't overwrite shared environments, and can't collide with the 621 existing names. First request in the folder resets them:
  ```javascript
  // pre-request of the first request in AB#<ID>
  Object.keys(pm.collectionVariables.toObject()).filter(k => k.startsWith("AB186076_")).forEach(k => pm.collectionVariables.set(k, ""));
  ```
- Read existing shared values (e.g. `{{AbEntryCompanyKey}}`) only if the folder itself creates them; otherwise create your own data.
- Never hardcode keys returned by the server; never store credentials or tokens in collection variables.

## 6. Clean-up

- `Check Deletion` shows the pattern: create parent + children → delete → read each and expect `Data.length === 0`.
- Older `CRUD-SQL-Legacy` creates data and never deletes it. **New tests:** end the folder with `Delete` requests for everything created (by stored keys), each with `Validate Code:0`.

## 7. Known issues in the existing suite (don't copy; report separately)

- `SQL-ReadCompany`, `Legacy-ReadCompany`, `Bugs/115567/ReadCompany`: compare `jsonData.AbEntry.Data.<Field>` (Data is an array → undefined) with `pm.globals.get(...)` (never set) → likely always pass. `Check Email1` / `Check Phone1` compare an object with a string.
- Typos/duplicates: `Check Response Measage`, `RerportstoKey`, names ending in ` Copy`, three requests named `Read Address Default using AddressSearcher`, `-Disabled` requests still present.
