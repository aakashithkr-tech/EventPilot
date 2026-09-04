# EventPilot — Backend build progress

Building the real backend + wiring it to the existing frontend, one feature at a time, same architecture pattern every time: Mongoose model → Express controller/routes → frontend service with the **same method signatures the UI already calls** → UI stays untouched.

## ✅ Feature 1 — Real Authentication (done)

- **`server/`** — Express + TypeScript + MongoDB backend.
  - `POST /api/auth/register` — creates a real user in MongoDB, hashes the password with bcrypt, returns a JWT.
  - `POST /api/auth/login` — verifies email + hashed password, returns a JWT.
  - `GET /api/auth/me` — validates the JWT and returns the current user (protected route).
  - `POST /api/auth/logout` — protected route, clears client-side session.
  - `GET /api/health` — quick check that the server + env are up.
  - Centralized error handling (`success/false` envelope, proper 400/401/404/409/500 codes), env var validation (won't boot with a missing `JWT_SECRET`/`MONGODB_URI`), Mongoose `User` model with a unique/indexed email, password hash never leaked in `toJSON()`.
- **`frontend/src/services/api.ts`** — single fetch client every service goes through: attaches the JWT, unwraps the `{success, data}` envelope, throws a typed `ApiError` (including a distinct "backend unreachable" case).
- **`frontend/src/services/authService.ts`** — no in-memory mock users. `signup`/`login`/`logout`/`resetPassword` all call the real API. `refreshSession()` re-validates the stored token against the backend on load instead of trusting `localStorage`.
- **`frontend/src/store/authContext.tsx`** — async auth calls, validates session on app load (`isAuthReady` flag) so a refresh doesn't flash the login screen for someone still logged in.
- `resetPassword` is an honest stub (needs an email provider) — returns "not implemented yet" instead of pretending to work.

## ✅ Feature 2 — Real Events (done, this build)

- **`server/src/models/Event.ts`** — Mongoose model: `name`, `type` (hackathon/competition/conference/workshop — matches the frontend's existing type union so no dropdown UI changed), `description`, `websiteUrl`, `status`, `finalDeadline`, `progress`, `healthScore`, `teamSize`, `nextAction`, plus `ownerId` and `members[]` for real authorization. Indexed on `ownerId` and `members`.
- **`server/src/controllers/eventController.ts`** + **`routes/eventRoutes.ts`** — all mounted under `/api/events`, all behind `requireAuth`:
  - `POST /api/events` — creates the event, sets the creator as `ownerId` and sole initial `member`.
  - `GET /api/events` — returns only events the requesting user owns or is a member of (real isolation, not a shared collection).
  - `GET /api/events/:id`, `PATCH /api/events/:id`, `DELETE /api/events/:id` — all authorization-checked; a user requesting an event they don't own/belong to gets a `404` (not a `403`), so they can't even confirm the event exists. Delete is owner-only. Field-level validation on `type`, `status`, `finalDeadline`, `progress`, `healthScore`.
- **`frontend/src/services/eventService.ts`** (new) — `list()`, `get()`, `create()`, `update()`, `remove()` against the real API.
- **`frontend/src/store/storeContext.tsx`** — `events` state is no longer seeded from `mockData.ts`/`localStorage`. It's fetched from the backend once the auth session is confirmed (`isAuthReady && isAuthenticated`), with `eventsLoading` / `eventsError` / `refreshEvents()` exposed from the store for the UI to use.
  - `addEvent(...)` is now `async`, persists the event via `POST /api/events`, and uses the **real Mongo `_id`** returned for the deadlines/requirements/resources/team it still builds locally (those four are still mock-array state — not migrated yet, on purpose, same "one feature at a time" rule).
  - `updateEvent(...)` is now `async` and optimistic: applies the change to local state immediately, persists it via `PATCH /api/events/:id` in the background, and **rolls back + surfaces a notification** if the save fails, instead of silently pretending it worked.
  - `recalculateProgress` (fired when a task/requirement is toggled) and `triggerDeadlineChangeSimulation` (the deadline-change demo) both now go through `updateEvent`, so `progress`, `status`, `healthScore`, and `finalDeadline` changes are real, persisted writes — not just local state mutation.
- **`frontend/src/pages/Onboarding.tsx`** — `handleCreateWorkspace` is now `async`; the "Create Event Workspace" button shows a real loading state (`Creating Workspace…`, disabled while in flight) and a real inline error banner if the backend rejects the request, instead of assuming success.
- **`frontend/src/pages/Dashboard.tsx`** and **`Events.tsx`** — added loading and error states (with a Retry button) ahead of the existing empty-state / event-grid rendering. No visual/layout changes to the existing cards, filters, or grid — same components, same styling, just real data feeding them and honest states while that data is in flight or failed to load.

### Verified in this build
- Both `server` and `frontend` compile with `tsc` in strict mode — zero errors.
- `npm run build` (Vite production build) succeeds.
- Code was reviewed end-to-end for the authorization rule that matters most going forward: **`GET/PATCH/DELETE /api/events/:id` return 404 for a user who isn't the owner or a member**, which is the isolation guarantee every future feature (team, tasks, notifications) depends on.

### Not verified in this build (and why)
This sandbox has no network access to MongoDB's package or binary servers (its egress is restricted to a fixed allowlist of dev-tooling domains — npm, PyPI, GitHub, crates.io, Ubuntu archives — and no Mongo domain is in it), and `apt` has no installable `mongodb` package on this Ubuntu image either. So **I could not actually boot a live MongoDB instance and run the registration → login → create-event → isolation flow against a real database in this environment.** Everything above is verified by compilation + code review, not by running it end-to-end. When you run this locally with a real `MONGODB_URI` (local `mongod` or a free MongoDB Atlas cluster), please run through the flow below and tell me if anything breaks — I'd rather you catch it than assume it's fine.

## ✅ Feature 3 — Real Team Management + Invitations (done, this build)

- **`server/src/models/EventMembership.ts`** — event-scoped team membership. A compound unique index on `(eventId, userId)` makes it structurally impossible to double-add someone or leak membership across events — this is the actual enforcement of "team membership is event-specific," not just app logic that could drift.
- **`server/src/models/EventInvitation.ts`** — pending email invites, scoped to one event, 7-day expiry, role restricted to non-owner roles.
- **`server/src/controllers/teamController.ts`** + routes on `/api/events/:id/team`:
  - `GET` — full roster (populated with member name/email/avatar), open to any owner/member of the event.
  - `POST` — add an existing EventPilot user directly by `userId` or `email` (owner/admin/lead only), idempotent re-activation if they were previously removed.
  - `DELETE /:userId` — remove a member (self-removal always allowed; removing someone else requires admin/lead/owner; the owner can never be removed).
- **`server/src/controllers/invitationController.ts`**:
  - `POST /api/events/:id/invitations` — send an invite (admin/lead/owner only), blocks duplicate pending invites and inviting someone already on the team.
  - `GET /api/events/:id/invitations` — list an event's invitations (admin/lead/owner only).
  - `GET /api/invitations/mine`, `POST /api/invitations/:id/accept`, `POST /api/invitations/:id/decline` — **the email match is derived from the logged-in session, never trusted from the request body or URL.** Accepting an invite that wasn't sent to your account is a `403`, not a silent success.
  - Accepting creates the `EventMembership` and pushes the user into the parent `Event.members[]` array in the same operation, so the isolation check every other route relies on (`GET /api/events` only returning events you own/belong to) picks the newly joined event up immediately.
- **`server/src/utils/eventAccess.ts`** (new) — the owner-or-member authorization check used by every event-scoped controller (events, team, invitations, and every future feature) now lives in one place instead of being copy-pasted.
- **`server/src/controllers/eventController.ts`** — `createEvent` now also creates the owner's `EventMembership` record, and `deleteEvent` cleans up its memberships/invitations so nothing orphans.
- **`frontend/src/services/membershipService.ts`** (rewritten) — same public method names the UI already called (`getEventMembers`, `inviteUser`, `getPendingInvitationsForEmail`, `acceptInvitation`, `declineInvitation`, ...), all now real API calls instead of an in-memory array. `getPendingInvitationsForEmail` keeps its `email` parameter for call-site compatibility but the backend actually derives it from the session token — belt-and-braces against a client ever spoofing whose invitations it's asking for.
- **`frontend/src/store/authContext.tsx`** — the invitation-loading `useEffect`, `login`, `acceptInvitation`, `declineInvitation`, and `refreshInvitations` now `await` the real async service instead of calling synchronous mock methods (this was already `async`-shaped in the UI, it just wasn't hooked up to anything real).
- **`frontend/src/components/ui/InviteMemberModal.tsx`** — dropped the hardcoded `'u1'` TODO placeholder and the fake `setTimeout` network delay; it now sends a real invite and shows the real backend error (e.g. "already pending", "already on the team") if the call fails, instead of assuming success.
- **`frontend/src/components/layout/EventSwitcher.tsx`** — **fixed a real regression from Feature 2.** This component was filtering the store's `events` against the old mock `membershipService`'s hardcoded membership list (`e1`, `e2`, ...), which never matches real backend event ids — so after Feature 2 shipped, the switcher silently rendered nothing for every real event. It's rewritten to trust the store's `events` directly (already server-authorized to just this user) and shows the member count from `event.members.length` instead of a separate service call.
- **`frontend/src/types/index.ts`** — `Event` gained optional `ownerId`/`members`, `EventMembership` gained an optional populated `user`, `EventInvitation` gained an optional populated `event` — all additive, nothing existing broke.

### Verified in this build
- Backend and frontend both compile clean under strict `tsc`, and `vite build` succeeds.
- Traced the accept-invitation path by hand for the isolation guarantee that matters: a user accepting an invite gets added to `EventMembership` **and** `Event.members[]` in the same request, so `GET /api/events` shows the new event on the very next fetch — no stale/missing state window.
- Confirmed (by reading, not running) that `EventMembership`'s unique `(eventId, userId)` index is the actual backstop against the spec's core requirement — team membership never bleeding across events — independent of whether the application code gets it right.

### Not verified in this build (same reason as Feature 2)
Still no live MongoDB in this sandbox (see Feature 2's note — no network path to Mongo's servers, no installable `mongodb` package). The full accept/decline/remove flow, the unique-index conflict behavior, and the "User B can't see User A's team" isolation are all reviewed and structurally sound but **not run against a real database.** Please run the flow below locally.

### Known gap (being upfront about it)
The existing frontend never actually shipped an "accept this invitation" screen or notification — `pendingInvitations` is tracked in `authContext` but no component in your zip ever rendered it or called `acceptInvitation`/`declineInvitation`. That plumbing is now real end-to-end on the backend and in the context, but there's no UI trigger for it yet. Flagging this rather than bolting on a UI element that wasn't in the original design — happy to build one (a notification-style banner would fit the existing patterns) if you want it as part of the next pass.

## What's still mock (not touched yet, on purpose — next up)

Deadlines, the `TeamMember`/`workload` concept used inside `EventWorkspace`'s Team tab (a separate, still-mock data shape from the `EventMembership` system built in Feature 3 — see note below), notifications, the AI agent, the planner, dashboard "today's priorities", event health calculation, command palette — `mockData.ts`, `notificationService.ts`, `aiService.ts`, `utils/planner.ts`, `utils/notificationEngine.ts` are all still exactly as they were, keyed off real event IDs.

**Worth knowing:** your original frontend actually has two parallel "who's on this event" concepts — `EventMembership` (role/status, used by the invite modal, switcher, and now the Tasks assignee picker — all real) and `TeamMember` (name/workload %, used by `EventWorkspace`'s Team tab — still mock/local state). They were never unified in the design I received. The natural next step folds `TeamMember` into the real `EventMembership` data so the Team tab shows genuine team members (and real workload derived from real task counts) instead of mock ones — flagging it again since it's a decision, not a surprise later.

## ✅ Feature 4 — Real Tasks (done, this build)

- **`server/src/models/Task.ts`** — event-scoped Task model: `title`, `description`, `dueDate`, `priority`, `status`, `requirementId` (kept as a loose string — Requirements isn't a real model yet), plus `assigneeId` (a real `User` ref, not a mock id) and `createdBy`. Indexed on `(eventId, status)` and `(eventId, assigneeId)`.
- **`server/src/controllers/taskController.ts`** + routes:
  - `GET /api/events/:id/tasks`, `POST /api/events/:id/tasks` (mounted in `eventRoutes.ts`, behind the same `loadAuthorizedEvent` isolation check every other event-scoped feature uses)
  - `PATCH /api/tasks/:id`, `DELETE /api/tasks/:id` (new `taskRoutes.ts`, mounted at `/api/tasks` in `server.ts`) — both load the task, then authorize the requester against its **parent event**, so a task can't be read/edited/deleted by someone outside that event.
  - **The core guarantee this feature adds:** `assigneeId` is validated against a real, *active* `EventMembership` for that exact event before a task can be created or reassigned — `assertAssignable()` rejects (400) an attempt to assign a task to someone who isn't actually on the team, whether or not they're a EventPilot user elsewhere. This is "task assignments must reference actual users" enforced server-side, not just a frontend dropdown convention.
  - List/create/update all return the assignee **populated** (`assignee: { id, name, email, avatar }`), same pattern as `EventMembership`'s `user` — so the frontend never has to cross-reference a separate roster just to render a name.
- **`frontend/src/services/taskService.ts`** (new) — `list(eventId)`, `create(eventId, payload)`, `update(taskId, updates)`, `remove(taskId)` against the real API.
- **`frontend/src/types/index.ts`** — `Task` gained the populated `assignee` field and `createdBy`; `assigneeId` is now documented as a real user id.
- **`frontend/src/store/storeContext.tsx`**:
  - `tasks` is no longer seeded from `mockData.ts`/localStorage. Once events are loaded, tasks for every accessible event are fetched in one batch (`Promise.all` over `taskService.list(event.id)`), exposed as `tasksLoading` / `tasksError` / `refreshTasks` — refetches only when the *set* of event ids actually changes, not on every event field edit.
  - `addTask(...)` is now `async` and **throws on failure** instead of catching internally (same pattern as `addEvent`) — the caller (a modal submit) decides how to show the error, instead of the store silently no-op'ing.
  - `updateTaskStatus(...)` is now `async` and optimistic (same pattern as `updateEvent`): applies the status change to local state immediately, persists via `PATCH /api/tasks/:id` in the background, and **rolls back + surfaces a notification** if the save fails.
- **`frontend/src/pages/EventWorkspace.tsx`**:
  - Fetches the event's real roster (`membershipService.getEventMembers`) into `realRoster` and uses it — not the mock `TeamMember` array — to populate the "Assign Teammate" dropdown in the Add Task modal (`value` is now a real user id).
  - Kanban cards and the Task List view now render `task.assignee?.name` (the backend-populated field) instead of cross-referencing the mock `eventTeam` array by a mock member id that no longer matches a real `assigneeId`.
  - "Create Task" is now a real async submission: the button shows `Creating…` and disables while in flight, and a failed save shows an inline error **in the still-open modal** instead of closing as if it succeeded (matches the "do not fake backend success" rule — same treatment `Onboarding.tsx`'s "Create Event Workspace" already got in Feature 2).
  - The Team tab (workload bars, mock `TeamMember`) is intentionally untouched — see "what's still mock" above.
- **`frontend/src/pages/Tasks.tsx`** (the cross-event "Teammate Action Tasks" page) — same `task.assignee?.name` change, plus a loading state and a retry-on-error banner (same shape as `Events.tsx`'s from Feature 2), since this page now depends on a real fetch instead of synchronous mock data.

### Verified in this build
- Both `server` and `frontend` compile clean under strict `tsc` (`npx tsc --noEmit` in both, plus `npm run build` on the server's `tsconfig.json`).
- `npm run build` (Vite production build) succeeds — 1834 modules, no errors.
- Traced the authorization path by hand: `PATCH/DELETE /api/tasks/:id` load the task first, then run it through the exact same `loadAuthorizedEvent` used by events/team/invitations — a user who isn't the task's event owner/member gets the same 404-not-403 treatment as everywhere else, and `assertAssignable` independently blocks assigning to anyone without an *active* `EventMembership` row for that specific event, so cross-event assignment leakage isn't possible even if a client sent a valid-looking user id from a different event's roster.

### Not verified in this build (same reason as Features 2 & 3)
Still no live MongoDB in this sandbox — no network path to Mongo's servers, no installable `mongodb` package here. Everything above is verified by compilation + code review, not by running it end-to-end. Please run the flow below locally.

## ✅ Feature 5 — Real Requirements (done, this build)

- **`server/src/models/Requirement.ts`** — event-scoped Requirement model, matching the frontend's existing field set exactly: `title`, `completed`, `description`, `requiredBy`, `sourceLink`, `verified`, plus `eventId` and `createdBy`. Indexed on `(eventId, completed)`.
- **`server/src/controllers/requirementController.ts`** + routes:
  - `GET /api/events/:id/requirements`, `POST /api/events/:id/requirements` (mounted in `eventRoutes.ts`, behind the same `loadAuthorizedEvent` isolation check every event-scoped feature uses).
  - `POST /api/events/:id/requirements/bulk` — creates several requirements for an event in one call. This exists because event creation hands back a whole batch of AI-analysis requirements at once (`Onboarding.tsx`); doing that as N sequential `POST`s would be slow and non-atomic-looking, so it's one validated `insertMany` instead.
  - `PATCH /api/requirements/:id`, `DELETE /api/requirements/:id` (new `requirementRoutes.ts`, mounted at `/api/requirements` in `server.ts`) — both load the requirement, then authorize the requester against its **parent event**, identical to how `taskController` protects `PATCH/DELETE /api/tasks/:id`.
- **`frontend/src/services/requirementService.ts`** (new) — `list(eventId)`, `create(eventId, payload)`, `bulkCreate(eventId, payload[])`, `update(requirementId, updates)`, `remove(requirementId)` against the real API.
- **`frontend/src/store/storeContext.tsx`**:
  - `requirements` is no longer seeded from `mockData.ts`/localStorage. Fetched per accessible event in one batch, same as `tasks` — exposed as `requirementsLoading` / `requirementsError` / `refreshRequirements`, refetching only when the *set* of event ids changes.
  - `addEvent(...)` now bulk-persists the AI-analysis requirements via `POST /api/events/:id/requirements/bulk` right after the event itself is created, using the real Mongo `_id`s that come back (rather than fabricating local-only ids) to feed `generatePrepPlan`.
  - `toggleRequirement(...)` is now `async` and optimistic (same pattern as `updateTaskStatus`): flips `completed` in local state immediately, persists via `PATCH /api/requirements/:id` in the background, and **rolls back + surfaces a notification** if the save fails. Callers in `EventWorkspace.tsx`/`Onboarding.tsx` fire-and-forget it (`onChange={() => toggleRequirement(req.id)}`), which still works fine now that it returns a `Promise` instead of `void`.
  - `recalculateProgress` and `triggerDeadlineChangeSimulation` already read from the `requirements` array by reference — no changes needed there, they now just see real, persisted data instead of mock data.
- **What I deliberately left alone:** `Task.requirementId` stays a loose string for now rather than becoming a real `Requirement` ref. Upgrading it is a small, mostly-mechanical follow-up (add `ref: 'Requirement'`, validate it resolves to a requirement on the same event, same shape as `assertAssignable`) — flagging it as the natural next step rather than doing it opportunistically in this pass, since it touches `taskController.ts`'s create/update validation and wasn't the thing asked for this round.

### Verified in this build
- Both `server` and `frontend` compile clean under strict `tsc` (`npx tsc --noEmit` in both).
- `npm run build` (Vite production build) succeeds — 1835 modules, no errors.
- Traced the authorization path by hand: `PATCH/DELETE /api/requirements/:id` load the requirement first, then run it through the exact same `loadAuthorizedEvent` used by events/team/invitations/tasks — a user who isn't the requirement's event owner/member gets the same 404-not-403 treatment as everywhere else. `bulkCreateRequirements` validates every item in the array before writing any of them (so a bad item at index 5 doesn't leave a partial batch of 4 orphaned requirements behind).

### Not verified in this build (same reason as Features 2–4)
Still no live MongoDB in this sandbox. Everything above is verified by compilation + code review, not by running it end-to-end. Please run the flow below locally.

## ✅ Feature 6 — Real Resources (done, this build)

- **`server/src/models/Resource.ts`** — event-scoped Resource model, matching the frontend's existing field set exactly: `name`, `type` (`template | document | link`), `fileType`, `source`, `url`, plus `eventId` and `createdBy`. Indexed on `(eventId, type)`.
- **`server/src/controllers/resourceController.ts`** + routes — same shape as `requirementController.ts`:
  - `GET /api/events/:id/resources`, `POST /api/events/:id/resources` (mounted in `eventRoutes.ts`, behind `loadAuthorizedEvent`).
  - `POST /api/events/:id/resources/bulk` — same reasoning as requirements' bulk endpoint: the AI-analysis step at event creation hands back a batch of resources alongside requirements, so this is one validated `insertMany` rather than N sequential calls.
  - `PATCH /api/resources/:id`, `DELETE /api/resources/:id` (new `resourceRoutes.ts`, mounted at `/api/resources` in `server.ts`) — load-then-authorize-against-parent-event, identical to every other event-scoped resource so far.
- **`frontend/src/services/resourceService.ts`** (new) — `list(eventId)`, `create(eventId, payload)`, `bulkCreate(eventId, payload[])`, `update(resourceId, updates)`, `remove(resourceId)` against the real API. `update`/`remove` exist for completeness/future use even though today's Resources tab is read-only (no add/edit/delete UI exists yet — see below).
- **`frontend/src/store/storeContext.tsx`**:
  - `resources` is no longer seeded from `mockData.ts`/localStorage. Fetched per accessible event in one batch, same as `requirements` — exposed as `resourcesLoading` / `resourcesError` / `refreshResources`.
  - `addEvent(...)` now bulk-persists the AI-analysis resources via `POST /api/events/:id/resources/bulk` right after the event is created, alongside the same call it already makes for requirements, using the real Mongo `_id`s returned.
- **What I deliberately left alone:** the Resources tab in `EventWorkspace.tsx` only *lists* resources today — there's no add/edit/delete UI to wire up yet, so `resourceService.update`/`remove` aren't called from anywhere in the frontend yet. They're there, tested via the API shape, and ready for whenever that UI gets built — flagging it rather than inventing UI that wasn't asked for.

### Verified in this build
- Both `server` and `frontend` compile clean under strict `tsc` (`npx tsc --noEmit` in both).
- `npm run build` (Vite production build) succeeds — 1836 modules, no errors.
- Traced the authorization path by hand: `PATCH/DELETE /api/resources/:id` load the resource first, then run it through the exact same `loadAuthorizedEvent` used by every other feature — a user who isn't the resource's event owner/member gets 404, not 403. `bulkCreateResources` validates every item before writing any of them, same all-or-nothing guarantee as `bulkCreateRequirements`.

### Not verified in this build (same reason as Features 2–5)
Still no live MongoDB in this sandbox. Everything above is verified by compilation + code review, not by running it end-to-end. Please run the flow below locally.

## How to run this

**1. Backend**
```
cd server
cp .env.example .env
# edit .env: set MONGODB_URI (local mongod, or a free MongoDB Atlas cluster)
#            set JWT_SECRET to any long random string
npm install
npm run dev
```

**2. Frontend**
```
cd frontend
cp .env.example .env
npm install
npm run dev
```

**3. Test it (please run this)**
1. Everything from Features 2 & 3's checklists still applies.
2. As User A (owner of Event A, with User B already on the team from Feature 3's invite flow), open Event A → Tasks tab → Add Task. Confirm the "Assign Teammate" dropdown shows User B by real name (not a mock name), pick them, and submit. Check MongoDB's `tasks` collection for a real document with `assigneeId` set to User B's actual `_id`.
3. Try assigning a task to a `userId` that is *not* on Event A's team (e.g. curl the API directly with a real User C id who was never invited) → expect a `400` ("Assignee must be an active member of this event"), not a silently-accepted task.
4. Toggle a task from Todo → In Progress → Done on the Kanban board; confirm the change survives a page refresh (i.e. it's reading from `GET /api/events/:id/tasks`, not local state).
5. As User C (not on Event A), try `PATCH /api/tasks/:id` on one of Event A's tasks directly → expect `404`.
6. Remove User B from Event A's team (Feature 3's remove-member flow), then try creating a new task assigned to User B → expect the same `400` as step 3, since their `EventMembership` is no longer active.
7. Open the global "Tasks" page (not inside a workspace) and confirm it shows tasks from *all* your events with correct per-task event names and assignee names, with a loading spinner on first load and a Retry button if you stop the backend mid-session.
8. Create a new event through Onboarding (the AI-analysis step produces a batch of proposed requirements) → confirm MongoDB's `requirements` collection has one real document per item, all sharing the new event's real `eventId`.
9. Open that event's Requirements tab and check a box → confirm the checkbox state survives a page refresh (i.e. it's reading `GET /api/events/:id/requirements`, not local state), and that the event's progress/health numbers move as a result (`recalculateProgress` now factoring in real requirement completion).
10. As User C (not on Event A), try `PATCH /api/requirements/:id` on one of Event A's requirements directly → expect `404`.
11. In that same new event's Resources tab, confirm the AI-analysis resources (templates/documents/links) show up and match what MongoDB's `resources` collection has for that `eventId`.
12. As User C, try `PATCH /api/resources/:id` on one of Event A's resources directly → expect `404`.

## ✅ Feature 7 — Real Deadlines (done, this build)

- **`server/src/models/Deadline.ts`** — event-scoped Deadline model, matching the frontend's existing field set exactly: `title`, `date`, `type` (`official | ai-recommended | personal | team`), `verified`, plus `eventId` and `createdBy`. Indexed on `(eventId, type)` and `(eventId, date)`.
- **`server/src/controllers/deadlineController.ts`** + routes — same shape as `requirementController.ts`/`resourceController.ts`:
  - `GET /api/events/:id/deadlines`, `POST /api/events/:id/deadlines` (mounted in `eventRoutes.ts`, behind `loadAuthorizedEvent`).
  - `POST /api/events/:id/deadlines/bulk` — same reasoning as requirements'/resources' bulk endpoints: event creation hands back a batch of official deadlines *and* the planner generates a batch of AI-milestone deadlines, both at once, so this is one validated `insertMany` rather than N sequential calls.
  - `PATCH /api/deadlines/:id`, `DELETE /api/deadlines/:id` (new `deadlineRoutes.ts`, mounted at `/api/deadlines` in `server.ts`) — load-then-authorize-against-parent-event, identical to every other event-scoped resource so far.
  - `DELETE /api/events/:id/deadlines/ai-recommended` (new, deadline-specific) — deletes every `ai-recommended` deadline for an event in one call. This exists specifically for deadline-change recalculation: when the preparation plan is regenerated, the stale AI milestones need to actually disappear from the database, not just get filtered out of a local array.
- **`frontend/src/services/deadlineService.ts`** (new) — `list(eventId)`, `create(eventId, payload)`, `bulkCreate(eventId, payload[])`, `update(deadlineId, updates)`, `remove(deadlineId)`, `removeAiRecommended(eventId)` against the real API.
- **`frontend/src/store/storeContext.tsx`**:
  - `deadlines` is no longer seeded from `mockData.ts`/localStorage. Fetched per accessible event in one batch, same pattern as `requirements`/`resources` — exposed as `deadlinesLoading` / `deadlinesError` / `refreshDeadlines`.
  - `addEvent(...)` now bulk-persists **both** the manual/AI-analysis official deadlines and the planner's freshly generated AI-milestone deadlines in a single `POST /api/events/:id/deadlines/bulk` call, using the real Mongo `_id`s that come back — previously the official deadlines got fake local ids and the AI milestones were pure client-side objects that never touched the database.
  - `triggerDeadlineChangeSimulation(...)` is now `async` and does real, persisted work instead of only mutating local state: it looks up the actual "final submission" `Deadline` document and `PATCH`s its date, then calls `removeAiRecommended` followed by a fresh `bulkCreate` to replace the AI milestones for real. Each of those two steps has its own try/catch — if either fails, it surfaces a notification instead of silently pretending the recalculation succeeded, while the parts that did save stay saved (this isn't wrapped in one all-or-nothing transaction, since the two steps are independent concerns — a failed milestone regeneration shouldn't roll back a deadline date that *did* save).
- **`frontend/src/pages/Schedule.tsx`** — added a loading indicator next to the page's subtitle and a retry-on-error banner (same shape as `Events.tsx`'s from Feature 2), since the calendar now depends on a real fetch instead of synchronous mock data.
- **What I deliberately left alone:** there's still no "add a personal/team deadline" UI anywhere in the frontend (the `type` field supports `personal`/`team` but nothing creates one) — `deadlineService.create` exists and is tested via the API shape, ready for whenever that UI gets built, same as Resources' still-unused `update`/`remove`.

### Verified in this build
- Both `server` and `frontend` compile clean under strict `tsc` (`npx tsc --noEmit` in both).
- `npm run build` (Vite production build) succeeds — 1837 modules, no errors.
- Traced the authorization path by hand: `PATCH/DELETE /api/deadlines/:id` load the deadline first, then run it through the exact same `loadAuthorizedEvent` used by every other feature — a user who isn't the deadline's event owner/member gets 404, not 403. `bulkCreateDeadlines` validates every item before writing any of them, same all-or-nothing guarantee as `bulkCreateRequirements`/`bulkCreateResources`.

### Not verified in this build (same reason as Features 2–6)
Still no live MongoDB in this sandbox. Everything above is verified by compilation + code review, not by running it end-to-end. Please run the flow below locally.

## How to run this

**1. Backend**
```
cd server
cp .env.example .env
# edit .env: set MONGODB_URI (local mongod, or a free MongoDB Atlas cluster)
#            set JWT_SECRET to any long random string
npm install
npm run dev
```

**2. Frontend**
```
cd frontend
cp .env.example .env
npm install
npm run dev
```

**3. Test it (please run this)**
1. Everything from Features 2–6's checklists still applies.
2. Create a new event through Onboarding → confirm MongoDB's `deadlines` collection has one document per official deadline *and* one per AI-generated milestone, all sharing the new event's real `eventId`, with `type` correctly split between `official` and `ai-recommended`.
3. Open that event's Schedule/Timeline view and confirm the same dates render there — pulled from `GET /api/events/:id/deadlines`, not local state.
4. As User C (not on Event A), try `PATCH /api/deadlines/:id` on one of Event A's deadlines directly → expect `404`.
5. On Event A's workspace, click "Trigger +3d Extension" (the deadline-change simulation button). Confirm in MongoDB: the event's `finalDeadline` moved, the official "final submission" `Deadline` document's `date` moved to match, and the old `ai-recommended` documents for that event are gone, replaced by a new batch with later dates.
6. Stop the backend mid-session and click "Trigger +3d Extension" again → confirm you get a real failure notification (not a silent no-op, and not a UI that pretends the plan recalculated).
7. Restart the backend, refresh the page, and confirm the deadline data from step 5 is still there (i.e. it was actually persisted, not just held in memory during that session).

## ✅ Feature 8 — Real Event Updates (done, this build — smallest feature so far, as requested)

- **`server/src/models/EventUpdate.ts`** — event-scoped, append-only audit-log model: `type` (`deadline-change | requirement-added | announcement`), `title`, `description`, optional `metadata.oldValue`/`newValue`, plus `eventId` and `createdBy`. Indexed on `(eventId, createdAt)` for the "most recent first" list view. The frontend's existing `EventUpdate` type reads a `timestamp` field rather than `createdAt` — `toJSON()` exposes both instead of renaming the underlying Mongoose field, so nothing else had to change.
- **`server/src/controllers/eventUpdateController.ts`** + routes — deliberately smaller than every other feature's controller: this is an append-only log, so there's only `getEventUpdates` and `createEventUpdate` (`GET/POST /api/events/:id/updates`, mounted in `eventRoutes.ts` behind `loadAuthorizedEvent`) — no `PATCH`/`DELETE`, since nothing in the spec or the existing UI ever edits or removes a logged update, and inventing that would be scope no one asked for.
- **`frontend/src/services/eventUpdateService.ts`** (new) — `list(eventId)`, `create(eventId, payload)` against the real API.
- **`frontend/src/store/storeContext.tsx`**:
  - `updates` is no longer seeded from `mockData.ts`/localStorage. Fetched per accessible event in one batch, same pattern as `deadlines`/`resources`/`requirements` — exposed as `updatesLoading` / `updatesError` / `refreshUpdates`.
  - `triggerDeadlineChangeSimulation(...)` now calls `eventUpdateService.create(...)` to log the deadline-change entry for real, instead of only pushing a locally-fabricated `EventUpdate` object into state. This is the piece that makes deadline-change detection (spec §21) end-to-end real — the deadline itself, the recalculated AI milestones (Feature 7), *and* the audit-trail entry describing what happened all now survive a page refresh, not just the first two.
- **`frontend/src/pages/EventWorkspace.tsx`** — the Updates tab's "Operations Update log" now shows a small loading indicator and a retry-on-error banner, same shape as every other tab that reads real fetched data.
- **Also fixed while I was in `eventController.ts` (small, closely-related, not scope creep):** `deleteEvent` previously only cleaned up `EventMembership`/`EventInvitation` when an event was deleted — `Task`, `Requirement`, `Resource`, and `Deadline` documents for that event were silently orphaned in MongoDB (never deleted, never reachable again either, since every read for them goes through `loadAuthorizedEvent` on an event that no longer exists). This was a pre-existing gap from Features 4–7, each of which added a new collection without updating `deleteEvent`. Fixed now by adding `deleteMany({ eventId })` for all four collections plus the new `EventUpdate` collection, in the same place, so this doesn't quietly reappear on the next feature too.

### Verified in this build
- Both `server` and `frontend` compile clean under strict `tsc` (`npx tsc --noEmit` in both).
- `npm run build` (Vite production build) succeeds — 1838 modules, no errors.
- Traced the authorization path by hand: `GET/POST /api/events/:id/updates` both go through the same `loadAuthorizedEvent` as every other event-scoped route — a user who isn't the event's owner/member gets 404, not a peek at the audit log.

### Not verified in this build (same reason as Features 2–7)
Still no live MongoDB in this sandbox. Everything above is verified by compilation + code review, not by running it end-to-end. Please run the flow below locally.

## How to run this

**1. Backend**
```
cd server
cp .env.example .env
# edit .env: set MONGODB_URI (local mongod, or a free MongoDB Atlas cluster)
#            set JWT_SECRET to any long random string
npm install
npm run dev
```

**2. Frontend**
```
cd frontend
cp .env.example .env
npm install
npm run dev
```

**3. Test it (please run this)**
1. Everything from Features 2–7's checklists still applies.
2. On an event's workspace, click "Trigger +3d Extension" (the deadline-change simulation button). Open the Updates tab and confirm a new "DEADLINE UPDATED" entry appears with the old/new date shown; check MongoDB's `eventupdates` collection for a real document with matching `metadata.oldValue`/`newValue`.
3. Refresh the page and reopen the Updates tab → confirm that entry is still there (i.e. it's reading from `GET /api/events/:id/updates`, not local state that resets on refresh).
4. As User C (not on Event A), try `GET /api/events/:id/updates` on Event A directly → expect `404`.
5. Stop the backend mid-session and trigger the deadline-change simulation again → confirm you get a real failure notification for the update-log entry specifically (not silently missing from the log with no explanation).
6. As the owner, delete a test event that has tasks, requirements, resources, and deadlines on it → confirm all of those documents are actually gone from MongoDB afterward, not just the `Event` document itself (this exercises the `deleteEvent` cleanup fix above).

## ✅ Feature 9 — Real Notifications (done, this build — the biggest remaining lift, as flagged last time)

- **`server/src/models/Notification.ts`** — real, per-user model: `userId`, optional `eventId`, `type` (`critical | warning | info | success`, matches the frontend's existing union), `title`, `message`, `read`, optional `milestoneKey` for dedup, `createdBy`. Indexed on `(userId, createdAt)` for the inbox list. A **unique partial index on `(userId, milestoneKey)`** is the actual enforcement of "never notify the same user twice for the same milestone" — it's a database constraint, not app logic that could drift, so it holds even if the generator is called concurrently from two different team members' sessions at once. `toJSON()` computes a human `timestamp` string (`"Just now"`, `"5m ago"`, `"2h ago"`, `"Yesterday"`, `"3d ago"`) from the real `createdAt`, matching the shape the frontend `Notification` type already expects.
- **`server/src/services/notificationService.ts`** (new — first real backend `service`, not just controller+model) — `generateSmartNotifications(userId)` ports the staged-threshold logic that used to live only in the frontend's `utils/notificationEngine.ts` (15d/7d/3d/1d/3h, same message copy) into a real backend function that:
  1. Loads the requesting user's real, persisted events (`Event.finalDeadline`).
  2. Reads real incomplete-requirement counts (`Requirement.countDocuments`) instead of a client-side array filter.
  3. **Fans each due alert out to every real active `EventMembership` row on that event** (plus the owner) — this is what makes it team-specific (spec §20), not just "the caller's own copy."
  4. Relies on the model's unique index to make re-running this idempotent — a duplicate-key error (`code 11000`) is caught and treated as "already notified this user for this milestone," not a real error.
- **`server/src/controllers/notificationController.ts`** + routes on `/api/notifications` (all behind `requireAuth`):
  - `GET /` — the requesting user's own notifications only, most-recent-first.
  - `POST /` — create one notification; with `targetTeam: true` + `eventId`, fans out to every active member of that event (used for things like "deadline updated" reaching the whole team, not just whoever triggered it) instead of only the caller.
  - `PATCH /:id` — mark one as read; scoped to `{ _id, userId }` so a user can't mark (or even discover) another user's notification, same 404-for-not-yours pattern as `loadAuthorizedEvent`.
  - `PATCH /read-all` — mark everything unread as read for the current user. (Mounted *before* `PATCH /:id` in the router so Express doesn't swallow `"read-all"` as an `:id`.)
  - `POST /generate` — runs the smart engine above for the requesting user's events; returns only the notifications newly created *for that user* (everyone else's fan-out copies are already persisted and show up next time they fetch their own list).
- **`frontend/src/services/notificationService.ts`** (rewritten) — this used to be a pure client-side computation module (`computeStagedNotification`) with no persistence at all; it's now a real API client: `list()`, `create()`, `markRead()`, `markAllRead()`, `generate()`.
- **`frontend/src/utils/notificationEngine.ts`** — deleted. Its logic now lives (and actually persists) in `server/src/services/notificationService.ts`; nothing else imported it.
- **`frontend/src/store/storeContext.tsx`**:
  - `notifications` is no longer seeded from `mockData.ts`/`localStorage` (`ep_notifications` is gone). Fetched from the backend once auth is confirmed, exposed as `notificationsLoading` / `notificationsError` / `refreshNotifications`, same pattern as every other real domain.
  - The old `useEffect` that locally recomputed smart alerts on every `events`/`requirements` change is replaced with one that calls the real `notificationService.generate()` whenever the *set* of accessible events changes, and merges in whatever came back new for the current user. Dedup happens in the database now, not in a client-side `Set` that resets every session.
  - `addNotification(...)` keeps its existing synchronous-feeling call signature (no call site elsewhere in the store had to change) but now does a real optimistic-insert-then-persist: an immediate local entry, replaced with the server's saved copy once `POST /api/notifications` resolves, quietly removed if that save fails. It also gained an optional `targetTeam` flag; `triggerDeadlineChangeSimulation`'s "🔄 DEADLINE UPDATED" notification now sets it, so a deadline push actually reaches every real team member on the event, not just whoever clicked the button — this is the concrete, testable version of spec §20 ("team-specific notifications").
  - `markNotificationRead(...)` and `clearNotifications()` are now optimistic + real, with rollback to the previous list if the backend call fails, same pattern used by `toggleRequirement`/`updateTaskStatus`.
- **`frontend/src/pages/Notifications.tsx`**, **`Header.tsx`** — unchanged; both already read `notifications`/`markNotificationRead`/`clearNotifications` from the store, so real data flows through with no UI edits needed.

### Verified in this build
- Both `server` and `frontend` compile clean under strict `tsc` (`npx tsc --noEmit` in `server`, `npx tsc -b` in `frontend`).
- `npm run build` succeeds in both — server emits `dist/models/Notification.js`, `dist/services/notificationService.js`, `dist/controllers/notificationController.js`, `dist/routes/notificationRoutes.js`; frontend's Vite build succeeds (1838 modules, no errors).
- Traced the two guarantees that matter most here by hand:
  1. **Isolation** — `GET /api/notifications` and `PATCH /:id` both filter by `userId: req.userId` at the query level, so there's no code path where user A's session can read or mark-read user B's notification, even by guessing an id.
  2. **Idempotency** — `generateSmartNotifications` never checks "does this already exist" before inserting; it always attempts the insert and lets the unique `(userId, milestoneKey)` index reject duplicates. This means the dedup guarantee holds even under concurrent calls (e.g. two team members loading the dashboard at the same moment), which an app-level "check then insert" would not have guaranteed.

### Not verified in this build (same reason as every feature so far)
Still no live MongoDB in this sandbox — see the disclaimer at the top of this document. In particular, the **unique partial index** on `(userId, milestoneKey)` has never actually round-tripped through a real MongoDB server, so its exact syntax should be the first thing you confirm locally (check `db.notifications.getIndexes()` after the server boots and creates it).

## How to run this

**1. Backend**
```
cd server
cp .env.example .env
# edit .env: set MONGODB_URI (local mongod, or a free MongoDB Atlas cluster)
#            set JWT_SECRET to any long random string
npm install
npm run dev
```

**2. Frontend**
```
cd frontend
cp .env.example .env
npm install
npm run dev
```

**3. Test it (please run this)**
1. Everything from Features 2–8's checklists still applies.
2. Log in as a user with at least one event whose `finalDeadline` is within 15 days. Load the dashboard, then check the `notifications` collection in MongoDB — confirm real documents exist with a `milestoneKey` like `"<eventId>-smart-15d"`.
3. Refresh the page and reload the dashboard again → confirm you do **not** get a second copy of the same alert (this is the part that only a real database constraint can prove — check `db.notifications.getIndexes()` shows the unique `(userId, milestoneKey)` index, and that a second `POST /api/notifications/generate` returns an empty array).
4. Add a second real user to that event (Feature 3's team-add flow), have them log in, and confirm **they** also received their own copy of the same milestone alert — this is spec §20, team-specific targeting, actually working.
5. Click "Trigger +3d Extension" on that event → confirm every active team member's `notifications` list gets a new "🔄 DEADLINE UPDATED" entry, not just the person who clicked it.
6. Click a notification to mark it read (or "clear all") → refresh the page → confirm the read state persisted (i.e. it survived a refresh, unlike the old `ep_notifications` localStorage version which would have too, but this is now proving it reads from `GET /api/notifications`, not `localStorage`).
7. As User C (not on the event), hit `PATCH /api/notifications/:id` on one of another user's notification ids directly → expect `404`.
8. Stop the backend mid-session and reload → confirm `notificationsError` renders instead of a silent empty list (if `Notifications.tsx`/`Header.tsx` don't yet render `notificationsError`, that's a small, expected follow-up UI wire-up, not a backend gap).

## Next feature (tell me to go ahead and I'll build it the same way)
Preparation Planner + Event Health + "Today's priorities" (spec §14–17) — move `utils/planner.ts`'s `generatePrepPlan` and the frontend health-score formula into a real backend `plannerService`, now that every input it needs (real deadlines, requirements, tasks, and team membership) exists and is real. This also unlocks a real `GET /api/events/:id/priorities` endpoint for "what should I do today," which currently doesn't exist at all.

## ✅ Feature 10 — Real Event Source Analysis (new)

The onboarding URL/text analysis is now backed by the EventPilot server instead of the old hardcoded `simulateEventAnalysis()` result.

- **`server/src/services/eventAnalysisService.ts`** fetches public HTTP(S) event pages, follows redirects, extracts page metadata/visible content/JSON-LD dates, labelled deadlines, requirement/checklist items, team-size hints, and linked guideline/template resources. Missing information is left missing — the analyzer never fabricates a deadline or resource.
- **`POST /api/events/analyze`** is protected by authentication and returns a structured analysis with confidence + warnings. Pages with no clearly labelled deadline fail honestly instead of creating a fake date.
- **`frontend/src/services/eventAnalysisService.ts`** is the clean API boundary used by onboarding.
- **`frontend/src/pages/Onboarding.tsx`** now waits for the real analysis response, displays the actual counts returned by the server, shows confidence/warnings, preserves the detected source URL, and only then lets the user create the workspace.
- The existing manual entry flow remains available when a source cannot be read. PDF binary extraction and live inbox integration are intentionally still separate follow-up features; the UI no longer pretends a selected PDF/sample email was actually parsed.

### Local test
1. Keep the backend running on `http://localhost:5000` with a real MongoDB connection.
2. Keep the Vite frontend running on `http://localhost:5173`.
3. Sign in and paste a **specific public event page URL**, not a site's homepage.
4. Start analysis. The confirmation screen should contain dates/requirements/resources that were actually found on that page.
5. If the page has no clearly labelled deadline, EventPilot should show an analysis warning/error and let you try another source or add the event manually.

## Feature 11 — Event-scoped connected sources

EventPilot now has a real connected-source layer for event-specific updates:

- **Gmail:** OAuth 2.0 with the read-only Gmail scope. A short-lived signed OAuth state binds the Google authorization to the authenticated user and the selected event. Refresh tokens are encrypted with AES-256-GCM before storage; they are never sent to the browser or returned by the API.
- **Event isolation:** every connected source stores both `userId` and `eventId`. List/sync/disconnect endpoints require the authenticated user and the same event. Email searches are generated from the event name/domain and messages are re-checked against event-specific matching signals before analysis.
- **Automatic updates:** Gmail sources are polled every 15 minutes while the server is running, and can also be synced immediately from the workspace. Verified deadline changes are written to the deadline table, append-only Event Updates, team notifications, and the real preparation planner.
- **WhatsApp:** an official WhatsApp Business webhook channel is supported with per-event keyword binding and `X-Hub-Signature-256` verification. Personal WhatsApp scraping is intentionally not implemented. The official channel must be configured on the server before a source can be bound.
- **Privacy:** message bodies are processed transiently for extraction; EventPilot does not persist raw email/WhatsApp message content in the connected-source record.

### Connected-source environment variables

Copy the placeholders from `server/.env.example` into `server/.env` and configure only the providers you intend to use. Never commit real OAuth tokens, client secrets, webhook secrets, MongoDB passwords, or `APP_ENCRYPTION_KEY`.

For Gmail local development, the Google OAuth redirect URI must exactly match:
`http://localhost:5000/api/integrations/gmail/callback`

Generate the encryption key with:
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Google's OAuth policy requires requesting only the smallest scopes necessary; EventPilot requests Gmail read-only access rather than send/modify/delete access. See the official Google OAuth scope and policy documentation for current provider requirements.
