# Mobile recovery and reconstruction

Recorded October 8, 2026.

## What is known

The user reports that a mobile version was built before the PC reset. They used
it to test Astra's capabilities and were impressed with the result. They no longer
remember the implementation details. This is evidence of prior work, not evidence
of a specific framework, set of screens, or integration state.

The current checkout contains only the API. No mobile or web client was found,
and the available local Git history for `apps/mobile` and `apps/web` contains no
commits. This does not establish that the earlier client never existed or that
it cannot exist in another repository, backup, or previous conversation.

## Unknowns to preserve

- Native application, responsive website, PWA, or another prototype format
- Framework, platform support, and how it was run on a phone
- Screens, visual design, navigation, and interaction details
- Whether data was mocked or connected to a real backend
- Authentication, cookie/token storage, and email-link handling
- Decisions or tradeoffs made after the surviving backend plan

Do not select a framework or describe a screen as recovered based on guesses.
The engineering plan's original exclusion of native mobile apps is not a new
instruction from the user and may predate the lost mobile work.

## Proposed reconstruction process (new proposal, not recovered history)

1. Use any surviving chat, screenshot, deployment, or other repository if one
   becomes available. Do not require the user to remember everything before
   making progress on the backend.
2. Establish a small screen/interaction baseline for review: authentication,
   project list, and project detail are candidate starting points based on the
   current API and product plan, not confirmed features of the old version.
3. Decide whether the intended experience is browser-based or native before
   choosing a client stack and persistence strategy. The existing auth API is
   designed around same-origin browser cookies and CSRF; native integration has
   not been specified or tested.
4. Implement an approved small flow, connect it to the API, and verify it on the
   intended phone/browser environment before expanding the client.
5. Record the chosen stack, run instructions, design references, decisions, and
   acceptance checks in the repository. Keep implementation checkpoints in Git;
   a separate push is required for remote backup.

## Relationship to the backend roadmap

The auth database verification and Phase 1 project/membership/invitation APIs
are now implemented and locally verified. Backend work proceeds to templates,
proposals, and activation. A mobile design baseline can be established separately
when requested. Frontend auth pages and live email delivery remain outstanding.
