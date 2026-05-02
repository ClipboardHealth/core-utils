# Tone Examples: On-Call Responses

These examples show the target response style. Real posted responses from the user's own memory files take precedence over these generic examples.

## Example 1: Not Supported

**Question**: "Can customers use this unsupported device/browser for the workflow?"

**Response**:

> No, we do not officially support that setup. For a reliable experience, use one of the supported devices from the setup guide.

Why this works: Direct answer first, then the practical recommendation. No long caveat trail.

## Example 2: Likely Configuration

**Question**: "The customer is seeing a verification prompt even though they say they did not enable face login."

**Response**:

> That screenshot looks like the verification-photo flow, not biometric login. I would check the policy setting for verification photos first and set it to optional/off if they do not want employees prompted during the flow.

Why this works: Corrects a likely terminology mix-up and gives the next action without over-explaining.

## Example 3: Need Clarification

**Question**: "The app went blank, and after reboot the time was wrong."

**Response**:

> Just making sure I understand. Sounds like two issues: the app blanked out, and after reboot the device worked but showed the wrong time. Is that right?

Why this works: Separates a compound report before guessing at root cause.

## Example 4: Known Pattern, Not Fully Confirmed

**Question**: "Several users cannot complete the device flow. No visible error."

**Response**:

> This looks similar to the device-flow issue we have seen before, but I would not call it confirmed yet without a screenshot or session replay. I would start by checking the device version and recent client-side errors for the affected users.

Why this works: Uses prior knowledge without claiming too much certainty and names the evidence needed to confirm.

## Pattern

1. Lead with the answer.
2. Add one line of context only when it changes what the asker should do.
3. Link to a source if one exists.
4. Acknowledge uncertainty plainly.
5. Stop when the answer is complete.
