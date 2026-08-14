# Home Lists

Home Lists is an ingress-enabled Home Assistant add-on for lightweight household shopping and to-do management.

## Lists and items

- Separate shopping and to-do lists, with custom names and colors.
- Quick entry from every screen, with quantity/category fields for shopping and due date/priority fields for tasks.
- Complete, restore, and delete actions with immediate visual feedback.
- Shopping items grouped by category and to-dos grouped by due date.
- Search and status filters across the active view.
- Completed-item cleanup per list or across the current view.

## Today dashboard

- At-a-glance counts for open shopping items, due tasks, and weekly progress.
- Combined agenda for overdue and due-today tasks.
- Recently completed activity and shortcuts into the main views.

## Data and architecture

- Fastify JSON API with a React single-page interface.
- Data stored in `/data/home-lists.json` and written atomically.
- Responsive desktop sidebar and mobile bottom navigation.
- Home Assistant ingress support; no external account or cloud dependency.
- `GET /api/health` exposes a lightweight runtime health check.
