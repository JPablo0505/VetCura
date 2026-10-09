# Android app (owner) — Kotlin + Jetpack Compose

## Stack decision (per brief: evaluate Kotlin + Compose first)

Kotlin + Jetpack Compose + Retrofit + DataStore + Navigation-Compose.
Rationale: official native stack, declarative UI matching the mockup
cards, Retrofit maps 1:1 to the backend REST contract.

## Build status: BLOCKED — no JDK in this environment

`java -version` is not recognized on this machine, so neither
`./gradlew assembleDebug` nor any compilation/verification was possible.
Nothing below is claimed as built.

To reproduce the build once a JDK is available:

```bash
cd android
# requires JDK 17 + Android SDK (compileSdk 34)
./gradlew assembleDebug
```

Exact intervention needed: install JDK 17 and the Android SDK, or provide
a CI runner with them. The expected artifact is
`android/app/build/outputs/apk/debug/app-debug.apk`.

## Structure

- `app/src/main/.../data/Api.kt` — Retrofit contract mirror of the
  backend routes; billing totals are display-only from the server.
- `app/src/main/.../ui/theme/Theme.kt` — tokens from `docs/VISUAL-SPEC.md`.
- `app/src/main/.../ui/screens/Screens.kt` — login (email/password;
  Google button deferred until `GOOGLE_CLIENT_ID` + OAuth client exist),
  pets dashboard with vaccination alerts, appointment request/track,
  chronological history, invoices with loading/error/empty states.
- `MainActivity.kt` — bottom navigation (Mascotas, Citas, Facturas),
  JWT persisted in DataStore, runtime permission model documented in
  `docs/INSTALL.md` (INTERNET only at this stage).
