# Google Sign-In setup (Android + backend)

Status: CONFIGURED LOCALLY, phone validation pending — the Android
client (`VetCura Android Debug`) and the Web audience client exist in
Google Cloud; `backend/.env` (gitignored) carries the web audience and
the APK under test has it baked as `GOOGLE_CLIENT_ID`. The 501 path is
gone (fake tokens now answer 401 `invalid_google_token`). Nothing below
is claimed as tested against a real Google account yet.

## 1. Google Cloud project

1. Create a project at <https://console.cloud.google.com> (any name).
2. Configure the OAuth consent screen (External, app name VetCura).
3. Create credentials:
   - **Android**: package `com.vetcura.app` + your SHA-1
     (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`).
     Note its client ID (used by Play services, not pasted in code).
   - **Web application**: authorized origins `http://localhost:3001`.
     This is the **audience** the backend checks. Copy its client ID
     (`xxx.apps.googleusercontent.com`).

## 2. Backend configuration

```bash
GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
# optional extra audiences (comma-separated), e.g. a second web client:
GOOGLE_ALLOWED_AUDIENCES=<web-client-id>.apps.googleusercontent.com
```

The backend verifies signature, issuer (`accounts.google.com`),
expiry and audience with `google-auth-library`. Identities key by
stable `sub`. A known email WITHOUT a linked `sub` gets
409 `link_verification_required` — never auto-linked.

## 3. Android build configuration

```powershell
$env:VETCURA_GOOGLE_CLIENT_ID = "<web-client-id>.apps.googleusercontent.com"
# then the usual assembleDebug; or pass -PgoogleClientId=<id>
```

The Google button appears only when the ID is baked in. Linking an
existing account: log in with email first, then Perfil →
“Vincular cuenta de Google” (own-session proof).

## 4. End-to-end validation (once configured)

1. `POST /auth/google {id_token}` from the app → 200 + owner session.
2. Same `sub` again → same user id (no duplicate).
3. Existing email, fresh `sub` → 409 `link_verification_required`
   with `google_sub` still NULL in DB.
4. Wrong audience token → 401 `invalid_google_token`.
5. Staff account linking attempt → 403, nothing persisted.

## 5. FCM + email (same honesty rule)

- FCM: Firebase project + `FCM_PROJECT_ID`,
  `FCM_SERVICE_ACCOUNT_EMAIL`, `FCM_SERVICE_ACCOUNT_KEY` (newline-escaped
  private key). Android additionally needs `google-services.json`
  (NEVER committed) + Firebase BoM to fetch a token and call
  `POST /me/devices`.
- Email: `SMTP_HOST/PORT/USER/PASS/FROM`. Without them, queued items
  stay `pending`/`failed` with `provider_unconfigured` — the scheduler
  (`npm run notify:due`) reports counts honestly.
