# Historical plan snapshot

## Summary

Fix the shared Cognito magic-link auth failure behind storm `8e9b7951b284`.

The storm is not 26 independent locator flakes. The retained Playwright LLM reports for runs `28788442064` and `28788960641` show the same setup/auth failure: workplace login submits the magic-link form, Cognito `SignUp` returns the expected PreSignUp rejection with a canonical `from_admin_*` identifier, then the app initiates CUSTOM_AUTH with the email anyway and Cognito returns `NotAuthorizedException`. The UI never reaches `Verification link sent`, so unrelated specs fail in their shared sign-in helper.

## Fix confidence

- Fix class: `A5` — product fix for a real auth failure surfaced by tests.
- Confidence: `4/5`.

The evidence strongly ties this storm to the magic-link path using the submitted email after `ensureCognitoUser` resolves a `from_admin_*` Cognito username. Remaining uncertainty is limited to proving the changed auth flow resolves the staging Cognito path end-to-end for both magic-link request and redeem flows.

## Observability to reach 5/5

- Frontend auth signal: in a focused staging Playwright auth run, magic-link request reaches `Verification link sent`, and the retained network trace shows `InitiateAuth` uses the canonical `from_admin_*` username after the expected PreSignUp alias rejection.
- Backend/Cognito signal: Datadog or CloudTrail for the same run shows the expected `SignUp` / `UserLambdaValidationException` record, followed by a successful `InitiateAuth` challenge flow for the canonical username, with no corresponding `NotAuthorizedException` for the submitted email.
- E2E setup signal: password-mode setup either resolves the Cognito username before `AdminSetUserPassword` or provisions users through a path where email alias lookup succeeds; no `UserNotFoundException` remains for the focused auth spec.

## Storm details

- Shared error signature: `Error: expect(locator).toBeVisible() failed`
- Tests bundled: 26
- Repos affected: 1
- CI runs affected: 2
- First failure: `2026-07-06T11:36:16Z`
- Last failure: `2026-07-06T11:42:41Z`
- Investigation ticket: `[ticket redacted]`
- Affected commit in sightings: `40b3535bdcea`
- Current `origin/main` checked during investigation: `56b4dfa7131`; auth code path still exists.

## Contained fingerprints

`64980ce0bdd2`, `2c198abdc78b`, `a33392713e47`, `4f6cfcf736b8`, `fb9e31bd68c5`, `d11f1d2b4512`, `c951cd25352a`, `dd738066715a`, `e5474edb897c`, `94decf0326cf`, `65e9ea7238bc`, `9b1da545aaae`, `63641ab33750`, `694b9cafccab`, `faa38bc87438`, `371f41fa08e0`, `89ca2423c39c`, `28e20640d57b`, `f23030f9f53b`, `35b4b5e72a89`, `2d93cd67b48a`, `af4a361ad72d`, `d8a8744ac24b`, `51322020c02f`, `52c0e81a218c`, `3ecad6b809df`.

## Evidence

### Playwright artifacts

Downloaded `playwright-llm-report` artifacts from:

- [[external evidence reference]]([external evidence reference])
- [[external evidence reference]]([external evidence reference])

Both reports show shard `e2e-playwright-1` failing while the other shards were stopped by the workflow after the auth/setup failure.

Representative retained network body from `auth.spec.ts:69`, first failed attempt:

```json
{
  "__type": "UserLambdaValidationException",
  "message": "PreSignUp failed with error Signup is not available for this account type. Identifier: \"from_admin_334c80ff-9ff0-4fa2-8820-657fb3bbd028\"."
}
```

Immediately after that, the same attempt sends CUSTOM_AUTH with `USERNAME` set to the email address and Cognito returns:

```json
{
  "__type": "NotAuthorizedException",
  "message": "Incorrect username or password."
}
```

The password-mode auth test also fails before browser login with:

```text
Cognito user 'playwright-...' does not exist in pool 'us-west-2_HV1ibP3I6' after 5 attempts.
```

### Datadog / CloudTrail

Environment: SDLC/staging Cognito pool `us-west-2_HV1ibP3I6`, client ID `6v67adqpeaf6bsh0v8o26lrdjm`.

Queries run through `pup logs`:

- `service:cloudtrail environment:sdlc eventSource:cognito-idp.amazonaws.com eventName:SignUp errorCode:UserLambdaValidationException requestParameters.clientId:6v67adqpeaf6bsh0v8o26lrdjm "Signup is not available for this account type"`
- `service:cloudtrail environment:sdlc eventSource:cognito-idp.amazonaws.com eventName:InitiateAuth errorCode:NotAuthorizedException requestParameters.clientId:6v67adqpeaf6bsh0v8o26lrdjm "Incorrect username or password"`
- `service:cloudtrail environment:sdlc eventSource:cognito-idp.amazonaws.com eventName:AdminSetUserPassword errorCode:UserNotFoundException`

Counts observed for `2026-07-06T11:00:00Z` to `2026-07-06T12:00:00Z`:

- `SignUp` / `UserLambdaValidationException`: `1838`
- `InitiateAuth` / `NotAuthorizedException`: `1489`
- `AdminSetUserPassword` / `UserNotFoundException`: `635`

Samples came from the GitHub runner IP `35.160.3.213` and the `sdlc-github/GitHubActions` role for AdminSetUserPassword, matching CI rather than an end-user-specific outage. Similar `SignUp` expected-rejection records existed before the storm window; the problematic part is the follow-up auth using the email instead of the canonical Cognito username.

No evidence found for this being a schedule/reporting/chat backend outage, CI runner-pool outage, database/cache/queue issue, or independent per-test locator drift. There were routine staging deploy/change events in the broader window, but the failure signature is specific to Cognito identity resolution and the shared login helper.

## Code path to inspect

- `src/appV2/Auth/cognito/cognitoAuth.ts`
  - `ensureCognitoUser(email)` parses the `Identifier: "from_admin_*"` value and can return the canonical Cognito username.
  - `requestMagicLink(email)` currently initiates custom auth with the string it receives and stores the same string in the magic-link cache.
  - `completeMagicLinkSignIn({ payload, email })` re-initiates custom auth with the cached/prompted string.
- `src/mobile/Login/sendLoginEmail.ts`
  - The magic-link request path calls `await ensureCognitoUser(email)` and discards the returned username, then calls `requestMagicLink(email)`.
- `src/appV2/Auth/cognito/emailOtpAuth.ts`
  - Email OTP already has the correct pattern: resolve username from `ensureCognitoUser`, initiate auth with that username, and carry it for resend.
- `playwright/helpers/scheduleSeed.ts`
  - Most affected specs sign in through `signInAsWorkplaceUser`, which waits for `Verification link sent` after clicking `Get Sign-in Link`.
- `playwright/helpers/cognitoPassword.ts`
  - Password-mode tests call `AdminSetUserPassword` by email and hit `UserNotFoundException` when the user’s auth identifier is not the email alias.

## Expected implementation direction

Implement the fix in this ticket using the `cb-work` skill, or if unavailable, the `core:go` skill.

Suggested direction:

1. Make the magic-link request/redeem path mirror the canonical-username handling already used by email OTP.
2. Preserve the user-facing email for UI copy and remember-email behavior, but use the canonical Cognito username for `initiateCustomAuth` when PreSignUp returns a `from_admin_*` identifier.
3. Consider evolving the magic-link cache from a single email string to a small structured value containing the display/request email plus auth username, with a backward-compatible read path for existing cache entries.
4. Handle the cache-miss prompt path deliberately: if the user types an email on the redeem page, resolve the Cognito username before re-initiating auth, while avoiding creation of an extra magic-link challenge during redeem.
5. Add targeted unit coverage for `sendLoginEmail`, `requestMagicLink`/`completeMagicLinkSignIn`, and AuthRedirect cache/redeem behavior. Include coverage for unverified alias users where PreSignUp returns `Identifier: "from_admin_*"`.
6. Check whether `setCognitoPasswordForUser` should resolve by returned Cognito username for password-mode E2E setup, or whether those password tests should create users through a path that guarantees email alias lookup works.

Do not fix this by increasing Playwright timeouts or adding another retry around `Verification link sent`; the retained network and Datadog evidence show deterministic Cognito auth rejection.

## Required change / commit instructions

- Include this implementation ticket ID in the change body.

```bash

```

## Validation plan

Run the smallest relevant checks first, then broaden as needed:

```bash
npm run test:v2 -- src/mobile/Login/sendLoginEmail.test.ts src/appV2/Auth/cognito/emailOtpAuth.test.ts src/appV2/Auth/AuthRedirect/AuthRedirect.test.tsx src/appV2/redesign/Login/Login.test.tsx
npm run lint:fast
npm run typecheck
```

If credentials/environment are available, run a focused Playwright auth spec against staging after the unit-level fix.
