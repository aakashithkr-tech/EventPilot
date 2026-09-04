# EventPilot UI + Event Analysis fixes

## Fixed
- Event cards now have an actions menu with Rename event, Open workspace, Connect sources, and Delete event.
- Rename persists to MongoDB through the existing PATCH /api/events/:id endpoint.
- Delete uses the existing real DELETE /api/events/:id endpoint and cleans event-scoped data on the backend.
- Connect sources from the Events page opens the event's Sources tab directly.
- Sources tab provides real Gmail OAuth and WhatsApp Business connection controls.
- Event analysis now accepts event-page dates that omit the year when a page year is available, while continuing to avoid attaching time-only lines to the wrong milestone.

## Important WhatsApp limitation
The current backend intentionally supports the official WhatsApp Business/Cloud API, not scraping a normal personal WhatsApp account or private WhatsApp group from a group link. Do not present a group-link scraper as a real integration.
