# Dashboard Frontend Standard

Agora Dashboard 2.0 is a Context Operating Surface for human-agent teams. The interface should not feel like a generic AI dashboard, task board, or monitoring wall. It should help operators keep project context fresh, execute work with references, and keep governance traceable.

## Information architecture

Target global navigation:

- Home
- Projects
- Reviews
- Participants
- System
- Settings

Projects are the durable center of the product. Tasks are temporary execution containers. Agents, humans, runtimes, and bridges are participants or capabilities. Authenticated workbench navigation should stay short: Home, Projects, Reviews/Governance, Participants, System, and Settings.

## Project Workspace

Project pages should be organized around:

- Overview
- Context Map
- Current Work
- Knowledge / Harvest
- Participants
- Governance / Audit
- Operator

## Visual language

The visual direction is professional, restrained, and context-native. Use obsidian, graphite, ivory, paper, ember, copper, and mineral accents. Avoid generic AI neon, fake telemetry, chatbot visuals, gratuitous glass, and decorative terminal noise.

## Public / auth surface

The login and intro surface should establish the Agora brand first. The hero headline is `Agora`, not a long explanatory sentence, and it should be large enough to anchor the page without becoming poster-scale. The supporting copy should stay brief and leave the detailed product model to the workbench and documentation.

The top navigation, hero content, and lower proof bar must share the same max-width container so the page feels deliberately composed instead of assembled from unrelated panels.

## Context Field

The Context Field is Agora's dynamic visual system. On the public/auth surface it should feel like a molten, living field: lava-like ridges, pulsing heat, ember particles, and subtle texture that are visibly alive in full-motion mode. Reduced-motion mode should slow and simplify the motion rather than accidentally making the field look broken or static. It can appear on login, intro, overview, and carefully selected project surfaces. It represents context flow, reference density, and execution heat. It must never reduce readability.

Inside the authenticated workbench, the Context Field should quiet down. The project context, not the visual effect, becomes the main subject.


## Authenticated workbench surface

The internal Dashboard must inherit the login surface language, but at a lower intensity. Use the same warm paper / graphite / ember token family through `src/styles/tokens.css`; do not introduce one-off colors in components, pages, or inline styles. Page CSS should consume semantic variables such as `--surface-workspace-bg`, `--surface-context-anchor-bg`, `--project-tab-active-bg`, and `--surface-workspace-border`.

The AppShell, TopNav, Sidebar, workbench panes, project tabs, dense rows, cards, and control groups should all read from shared tokens. Internal pages may use a quiet ambient Context Field in the shell background, but primary information surfaces must stay readable and structured. Project Workspace is the first-class surface: Overview, Context, Current Work, Knowledge, Archive, and Operator should feel like sections of one context operating system, not separate admin pages.

Implementation rules:

- Keep raw color literals confined to theme tokens.
- Prefer semantic classes over inline style objects or Tailwind arbitrary values.
- Route new project-level navigation and cards through shared workspace classes.
- Use `surface-panel--workspace` and `surface-panel--context-anchor` for 2.0 project surfaces.
- Keep motion alive in full and reduced-motion modes; reduced motion slows the field instead of freezing it.


## Internal page convergence

All authenticated top-level pages should use the shared `interior-page` rhythm. Their first explanatory surface should normally be `surface-panel surface-panel--workspace surface-panel--context-anchor`, with ordinary data panels remaining quieter `surface-panel--workspace` surfaces.

The shell, top bar, footer, and main page content must align through `--content-max-width`. Do not solve alignment in individual pages. Board, reviews, template authoring, runtime targets, bridges, todos, archive, and participant surfaces may keep their domain-specific layouts, but their colors and depth must be mapped back to workspace tokens at the root and dark-theme levels.

Legacy visual token families such as board, review, liquid, or telemetry tokens are compatibility aliases only. They should resolve to `--surface-workspace-bg`, `--surface-context-anchor-bg`, `--row-bg`, `--detail-card-bg`, `--project-tab-active-bg`, and related semantic tokens rather than reintroducing blue/cyan AI-dashboard styling.

## Theme behavior

Dark mode should feel like a serious night operations surface with ember heat and graphite panels. Light mode should feel like warm paper and quiet system tooling. All colors and shadows must come from design tokens.

## Copy language

Use context-first vocabulary: project context, context map, reference bundle, current work, harvest, governance, audit, participants, and runtime capability. Avoid presenting the product primarily as an AI dashboard or agent swarm.
