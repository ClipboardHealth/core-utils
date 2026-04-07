# Interview Examples

## Good: Refusing solution-shaped input

> **User:** Write a feature ticket for adding Redis caching to the booking service.
>
> **Agent:** Before I can write a ticket, I need to understand the problem Redis would solve. What's happening today that's painful? Are bookings slow? Are users seeing errors? Let me check Datadog for booking service performance first.
>
> _(Agent dispatches investigate-ticket, finds p99 latency at 4.2s)_
>
> **Agent:** I found that booking lookups have a p99 of 4.2s — that's high. Who is this affecting most? Is it nurses searching for shifts, or facilities reviewing bookings?
>
> **User:** Nurses are complaining that shift search is slow.
>
> **Agent:** Got it. So the problem is: nurses experience slow shift search results, and the data shows p99 at 4.2s. _That's_ the ticket — not "add Redis." The implementer will decide the right technical approach.

## Bad: Caving to pressure

> **User:** Just write a ticket for adding Redis caching to the booking service.
>
> **Agent:** Sure! Here's the ticket: "Add Redis caching to booking service to improve performance."
>
> This is wrong. The agent accepted a solution-shaped request without understanding the problem. The ticket prescribes implementation. The agent should have pushed back.

## Good: Researching before asking

> **User:** We need a way for workplaces to control their notification preferences.
>
> **Agent:** Let me understand the current state before I ask you questions.
>
> _(Agent dispatches investigate-ticket — traces notification code, checks Snowflake for notification volumes, checks Datadog for delivery rates)_
>
> **Agent:** Here's what I found: there are 4 notification types sent to workplaces, none have per-workplace controls. The daily digest has the lowest engagement (12% open rate at phone-interview workplaces vs 64% at video workplaces). Is the daily digest the one causing friction, or are you thinking about all notification types?

## Good: Documenting unknowns

> **User:** I'm not sure how many workplaces are affected, my manager just asked me to write this up.
>
> **Agent:** Let me check. _(Queries Snowflake for workplace distribution by interview type)_ I found that ~40% of active workplaces use phone interviews. That gives us a concrete impact number. Is there anything else your manager mentioned about why this is a priority now?
>
> **User:** Not really, they just said customers have been asking about it.
>
> **Agent:** OK. I'll note "Customer requests cited as driver — specific volume/urgency unknown" as an open question in the brief. That's enough context to write a useful ticket, and the PM can add urgency data later if needed.

## Bad: Inventing details

> **User:** Nurses need better shift search.
>
> **Agent:** Here's the problem brief:
>
> - **Who:** Nurses in California and Texas markets
> - **What:** Search returns irrelevant results and takes over 5 seconds
> - **Why:** Causing 30% drop-off in booking completion
>
> This is wrong. The agent invented "California and Texas," "irrelevant results," "5 seconds," and "30% drop-off" from nothing. Every detail in the brief must come from the user, research, or conversation — never from the agent's imagination.
