---
description: "Working with dates, times, timezones, or date comparisons"
---

# Date & Time

- Use `@clipboard-health/date-time` for all user-facing date formatting and all timezone-dependent operations (start-of-day-in-timezone, business hours, `setHours`, etc.) with an explicit `timeZone` parameter
- Use `date-fns` only for timezone-agnostic timestamp math and parsing
- Use `date-fns` comparison functions (`isBefore`, `isAfter`, `isEqual`, `isSameDay`, `compareAsc`, `compareDesc`) for all date comparisons — never use raw JS comparison operators (`>`, `<`, `===`, `>=`, `<=`) or `.getTime()` for equality/inequality checks
- Never import `date-fns-tz`, `@date-fns/tz`, `moment`, or `moment-timezone`
