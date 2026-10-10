# Android app (owner) — Kotlin + Jetpack Compose

## Stack decision (per brief: evaluate Kotlin + Compose first)

Kotlin + Jetpack Compose + Retrofit + DataStore + Navigation-Compose.
Rationale: official native stack, declarative UI matching the mockup
cards, Retrofit maps 1:1 to the backend REST contract.

## Build status: WORKING (debug APK assembled 2026-10-10)

Toolchain (no admin needed, all portable under `%LOCALAPPDATA%`):
Temurin JDK 17 (`Programs\jdk17`), Android SDK (`Android\Sdk`:
cmdline-tools, `platforms;android-34`, `build-tools;34.0.0`, licenses
accepted), Gradle 8.7 (`Programs\gradle\gradle-8.7`).

```powershell
$env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\jdk17\jdk-17.0.20.1+1"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
Set-Location android
& "$env:LOCALAPPDATA\Programs\gradle\gradle-8.7\bin\gradle.bat" assembleDebug "-PapiUrl=http://<pc-lan-ip>:3001"
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Remaining manual steps (unchanged): real device needs the PC LAN IP
baked via `-PapiUrl` (emulator default is `http://10.0.2.2:3001`);
`gradle/wrapper/gradle-wrapper.jar` is still generated via any local
Gradle ≥ 8 (`gradle wrapper`) since Gradle publishes no standalone jar
URL.

## Fresh-machine setup (what was done here, reproducible)

1. Portable Temurin JDK 17 zip → `%LOCALAPPDATA%\Programs\jdk17`;
   set `JAVA_HOME` per session (no admin, no installer).
2. Android cmdline-tools zip → `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`;
   accept licenses; install `platform-tools`, `platforms;android-34`,
   `build-tools;34.0.0` via `sdkmanager`.
3. Copy `local.properties.example` to `local.properties` (gitignored)
   and set `sdk.dir` to your SDK path.
4. Portable Gradle 8.7 zip → run `gradle assembleDebug` directly
   (wrapper jar optional: `gradle wrapper --gradle-version 8.7`).

Expected artifact: `android/app/build/outputs/apk/debug/app-debug.apk`.
Install it with `adb install` or by copying the file to the phone;
the baked `API_URL` (`-PapiUrl`, default `http://10.0.2.2:3001` for the
emulator) must be reachable from the device.

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
