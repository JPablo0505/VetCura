# Android app (owner) — Kotlin + Jetpack Compose

## Stack decision (per brief: evaluate Kotlin + Compose first)

Kotlin + Jetpack Compose + Retrofit + DataStore + Navigation-Compose.
Rationale: official native stack, declarative UI matching the mockup
cards, Retrofit maps 1:1 to the backend REST contract.

## Build status: BLOCKED — no JDK, no Android SDK, no wrapper jar

Verified 2026-10-09 in this environment: `java`, `gradle`, `ANDROID_HOME`,
`ANDROID_SDK_ROOT` and `%LOCALAPPDATA%\Android` are all absent, so neither
`assembleDebug` nor any compilation was executed. Nothing below is claimed
as built. The wrapper jar is intentionally not committed (Gradle
publishes no standalone jar URL — the 404 on the raw GitHub path was
verified); generate it once with any local Gradle ≥ 8 (`gradle wrapper`)
or Android Studio.

Manual setup (precise steps, ~15 min + downloads):

1. Install JDK 17 (e.g. Temurin 17) and set `JAVA_HOME`.
2. Install Android SDK cmdline-tools; accept licenses; then install
   `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`.
3. Copy `local.properties.example` to `local.properties` (gitignored)
   and set `sdk.dir` to your SDK path.
4. From any Gradle ≥ 8 install run `gradle wrapper --gradle-version 8.7`
   inside `android/` to produce `gradle/wrapper/gradle-wrapper.jar`
   (first `./gradlew` run then downloads the 8.7 distribution).
5. `cd android && ./gradlew assembleDebug` (Windows: `gradlew.bat
   assembleDebug`).

Expected artifact: `android/app/build/outputs/apk/debug/app-debug.apk`.
Install it with `adb install` against an emulator running API 34 with the
backend reachable at `http://10.0.2.2:3001` (`API_URL` BuildConfig).

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
