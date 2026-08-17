# MasjidHub — Android staff app

A native Kotlin/Compose app for masjid staff, laid out for both phones and
tablets. It talks to the same API as the web dashboard (`/api/v1`), so nothing
about the backend changes.

Unlike the iOS app, this one is **built on every push**: the `Android` workflow
compiles the debug and release variants on GitHub Actions and uploads the debug
APK as a build artifact, so the code is compiled and checked for real. Tagging
a release publishes a **signed, installable APK** — see [Releasing](#releasing).

## What's in it

| Screen | What staff can do |
| --- | --- |
| Overview | Today's prayer times, dues totals, community counts, latest announcements |
| Prayer times | The next 7 or 30 days, adhan and iqamah, Jumu'ah |
| Households | Search and filter, open a household for details, members and fee status |
| Dues | Masjid-wide expected/collected/outstanding, filter by owing or no-fee, **record a payment** |
| Announcements | Read what's published |
| Events | Upcoming or all, with date/time ranges in the masjid's timezone |
| Account | Edit your name, change your password, sign out |

Recording an offline payment is the one thing the app writes; everything else
reads. Creating households, editing prayer timetables and publishing content
stay on the web dashboard, where the bigger forms belong.

## Building it

Open the `android/` directory in Android Studio (Ladybug or newer) and run, or
from a terminal with a JDK 17 and the Android SDK installed:

```bash
cd android
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug           # onto a connected device or emulator
```

Minimum Android 8.0 (API 26), targeting API 35.

## Releasing

Tag a version and GitHub Actions does the rest — builds, signs, and attaches an
installable APK (and a Play-ready `.aab`) to a GitHub release:

```bash
git tag android-v1.0.0
git push origin android-v1.0.0
```

Staff install it by opening the release page on their phone and tapping the
`.apk`; Android asks once for permission to install from that browser. The
`Android release` workflow can also be run by hand from the Actions tab, which
produces the same signed build as a downloadable artifact without publishing a
release page.

### One-time signing setup

Android will not install an unsigned APK, and every future update must be
signed with the **same** key or it will refuse to upgrade. Create the keystore
once, keep it somewhere safe, and never commit it:

```bash
keytool -genkeypair -v \
  -keystore masjidhub-release.jks \
  -alias masjidhub \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 masjidhub-release.jks   # macOS: base64 -i masjidhub-release.jks
```

Then add four repository secrets under **Settings → Secrets and variables →
Actions**:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the base64 output from above |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `masjidhub` |
| `ANDROID_KEY_PASSWORD` | the key password (often the same) |

The release workflow stops with a clear error if these are missing, rather than
publishing an APK nobody can install. The keystore is decoded to the runner's
temp directory, outside the checkout, so it is never packaged or uploaded.

Version numbers are set by CI: `versionName` comes from the tag
(`android-v1.0.0` → `1.0.0`) and `versionCode` from the workflow run number, so
it always increases.

## Pointing it at a different API

The base URL is a build config field, not a constant buried in code. Edit
`app/build.gradle.kts`:

```kotlin
buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3000\"")
```

`10.0.2.2` is the host machine as seen from the emulator. Plain `http://` is
blocked by default on Android 9+, so for a local API also add
`android:usesCleartextTraffic="true"` to `<application>` in the manifest, or a
network security config scoped to that host. Leave both out of anything you
ship.

## How it's put together

```
app/src/main/java/app/masjidhub/staff/
  MainActivity.kt      the single activity; hands the window size class to the UI
  data/                Models (kotlinx.serialization), ApiClient (OkHttp), TokenStore
  ui/                  SessionViewModel, AppScaffold (drawer + destinations)
  ui/components/       the shared card, stat tile, loader and paging helpers
  ui/screens/          one file per screen
  ui/theme/            the brand palette
  util/Format.kt       money, dates and timezones in one place
```

A few decisions worth knowing:

- **One layout serves both form factors.** A tablet keeps the navigation drawer
  open beside the content (`PermanentNavigationDrawer`); a phone gets the same
  drawer behind a menu button. No second navigation model to maintain.
- **Tokens are encrypted with an Android Keystore key** and only the ciphertext
  is written to shared preferences; backup and device transfer are switched off
  for the app. The client retries once through `/auth/refresh` on a 401 before
  dropping you at the login screen.
- **Calendar dates stay strings.** The API sends `YYYY-MM-DD` for prayer dates
  and fee dates; those are days in the masjid's timezone, not instants.
  Converting them to a date-time is how you get off-by-one bugs. Instants
  (`startsAt`, `publishedAt`) are parsed and always rendered in the masjid's
  timezone.
- **Reads time out at 60s.** Render's free tier sleeps, and a cold start can
  take most of a minute.
- **Few dependencies**: Compose, kotlinx.serialization and OkHttp. No DI
  framework, no navigation library, no image loader — the app is small enough
  that they would cost more than they save.
- **Colours are the web app's**: forest green `#1B4D33` and gold `#B98A2E` on
  warm greige, with a dark-mode set that mirrors the site's.

## Not in this version

Push notifications (prayer time or announcement alerts), offline caching,
creating or editing households, and localisation into Hindi and Kannada — the
web app has all four. Each is a self-contained follow-up.
