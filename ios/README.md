# MasjidHub — iOS staff app

A native SwiftUI app for masjid staff, universal across iPhone and iPad. It
talks to the same API as the web dashboard (`/api/v1`), so nothing about the
backend changes.

> **Not built or tested yet.** This code was written in a Linux container with
> no macOS, Xcode or Simulator available, so it has never been compiled. Treat
> the first build as part of the work: open it in Xcode, and send me the
> compiler errors — they'll be small and mechanical, and I'll fix them.

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

The Xcode project is generated from `project.yml` rather than committed, so
there is no `.pbxproj` to conflict over.

```bash
brew install xcodegen      # once
cd ios
xcodegen generate          # writes MasjidHub.xcodeproj
open MasjidHub.xcodeproj
```

Then pick your Apple team under **Signing & Capabilities** (signing is set to
automatic) and run on an iPhone or iPad simulator.

Requirements: Xcode 15 or newer, iOS 16 minimum deployment. There are **no
third-party dependencies** — no SPM packages, no CocoaPods.

## Pointing it at a different API

The base URL is a build setting, not a constant in code. Edit
`INFOPLIST_KEY_APIBaseURL` in `project.yml` and re-run `xcodegen generate`:

```yaml
INFOPLIST_KEY_APIBaseURL: http://192.168.1.20:3000
```

Use your Mac's LAN address rather than `localhost` when running on a device.
App Transport Security blocks plain `http://` by default, so for a local API
add an exception to `project.yml` under the target:

```yaml
    info:
      path: MasjidHub/Info.plist
      properties:
        NSAppTransportSecurity:
          NSAllowsLocalNetworking: true
```

(and drop `GENERATE_INFOPLIST_FILE` from `settings.base` when you do). Leave
this out of anything you ship.

## How it's put together

```
MasjidHub/
  App/          MasjidHubApp (@main) and RootView — the session gate and NavigationSplitView
  Auth/         Session (who's signed in) and TokenStore (Keychain)
  Networking/   APIClient (actor) and the query-string builder
  Models/       Codable mirrors of the API's JSON
  Design/       Brand colours, formatting, and the shared card/state views
  Features/     One file per screen
```

A few decisions worth knowing:

- **One `NavigationSplitView` for both devices.** iPad gets a persistent
  sidebar; iPhone collapses the same structure into a push navigation stack.
  No `#if` on device idiom, no second layout to maintain.
- **Tokens live in the Keychain**, not `UserDefaults`, and the client retries
  once through `/auth/refresh` on a 401 before dropping you at the login screen.
- **Calendar dates stay strings.** The API sends `YYYY-MM-DD` for prayer dates
  and fee dates; those are days in the masjid's timezone, not instants.
  Converting them to `Date` is how you get off-by-one bugs. Instants
  (`startsAt`, `publishedAt`) are parsed and always rendered in the masjid's
  timezone.
- **Requests time out at 60s.** Render's free tier sleeps, and a cold start can
  take most of a minute.
- **Colours are the web app's**: forest green `#1B4D33` and gold `#B98A2E` on
  warm greige, with a dark-mode set that mirrors the site's.

## Not in this version

Push notifications (prayer time or announcement alerts), offline caching,
creating or editing households, and localisation into Hindi and Kannada — the
web app has all four. Each is a self-contained follow-up.
