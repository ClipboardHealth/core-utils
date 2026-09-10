---
description: "Working with dates, times, timezones, or date comparisons"
---

# Date & Time

- Use `@clipboard-health/date-time` for all user-facing date formatting and all timezone-dependent operations (start-of-day-in-timezone, business hours, `setHours`, etc.) with an explicit `timeZone` parameter
- Use `date-fns` only for timezone-agnostic timestamp math and parsing
- Use `date-fns` comparison functions (`isBefore`, `isAfter`, `isEqual`, `compareAsc`, `compareDesc`) to compare instants — never use raw JS comparison operators (`>`, `<`, `===`, `>=`, `<=`) or `.getTime()` for equality/inequality checks
- Calendar-day comparisons are timezone-dependent, so they belong to `@clipboard-health/date-time` with an explicit `timeZone`. Do not reach for `date-fns` `isSameDay`: it resolves day boundaries in the host timezone, which makes the result depend on where the code runs
- Never import `date-fns-tz`, `@date-fns/tz`, `moment`, or `moment-timezone`
