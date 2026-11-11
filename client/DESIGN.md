# Hunt design system

Hunt's website is a work tool. A person opens it once or twice a day, scans what is new and what is due, opens a job, changes its status, and adds a note or a contact. Their agent does the same work over MCP. Everything here serves that loop: find the next job that needs you, act on it, move on.

This file is the reference for anyone changing the client. The tokens live in `src/styles/tokens.css`. The status glyphs live in `src/glyphs.tsx`. The view registry lives in `src/model.ts`.

## Direction

Hunt should sit comfortably next to Linear without copying it. It borrows Linear's working posture: a sidebar of views with quiet counts, one header row per view, dense 13px type, rows that align into columns, hairline separators, and a keyboard path for everything. It keeps its own identity through three choices:

- **The target family.** Hunt's mark is a ring with a center dot. The status glyphs grow out of it: an empty ring for a new job, a ring with a dot once you apply, a ring with a disc while you are in process.
- **The verdict column.** Each row ends in a short meter that shows the agent's score out of 100, next to the number. Down a list the meters read as a bar chart, so strong matches stand out before you read a word.
- **The accent means "this needs you".** The warm orange appears only on strong verdicts (75 and up), due follow-ups, the focus ring, and the mark. Buttons are neutral. The accent never decorates.

The mode is Operate (Impeccable). Familiar controls and predictable structure beat novelty. Brand shows up in precision, not ornament.

## Color

Colors are `light-dark()` pairs on `:root`. `color-scheme` picks the side, so the system setting and the theme toggle share one table. Every text pair below was measured with a WCAG contrast script.

### Neutrals

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--bg-window` | `#0f0f0f` | `#f4f4f4` | Window and sidebar |
| `--bg-panel` | `#131313` | `#ffffff` | The main panel, phone screens |
| `--bg-raised` | `#1c1c1c` | `#ffffff` | Menus, popovers, the command menu, sheets |
| `--bg-inset` | `#0f0f0f` | `#f7f7f7` | Code blocks, the note composer |
| `--bg-group` | `#171717` | `#fafafa` | Sticky group headers in lists |
| `--fill-1` | white 4% | black 3.5% | Hover |
| `--fill-2` | white 7% | black 6% | Selected row, active nav item, pressed |
| `--line` | `#1f1f1f` | `#efefef` | Hairlines between rows and sections |
| `--border` | `#292929` | `#e4e4e4` | Control and panel edges |
| `--border-strong` | `#3a3a3a` | `#d1d1d1` | Hovered controls, input edges |

### Text

| Token | Dark | Light | On panel | Use |
| --- | --- | --- | --- | --- |
| `--text-1` | `#f5f5f5` | `#1a1a1a` | 17.0 / 17.4 | Titles, values, primary labels |
| `--text-2` | `#ababab` | `#5c5c5c` | 8.1 / 6.7 | Company, secondary labels, prose captions |
| `--text-3` | `#858585` | `#6b6b6b` | 5.0 / 5.3 | Meta, timestamps, counts, placeholders |
| `--text-4` | `#5e5e5e` | `#a3a3a3` | 2.9 / 2.5 | Disabled text and decoration only, never information |
| `--text-prose` | `#e0e0e0` | `#262626` | 14.1 / 15.1 | Job descriptions, a step softer than titles for long reading |

### Accent and states

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--accent` | `oklch(72% 0.16 50)` | `oklch(56% 0.17 45)` | Strong verdict meter, due follow-ups, focus ring, mark |
| `--accent-text` | `oklch(76% 0.14 55)` | `oklch(52% 0.16 45)` | Accent used as text ("Due today") |
| `--blue` | `oklch(72% 0.12 250)` | `oklch(54% 0.15 255)` | Applied |
| `--green` | `oklch(75% 0.14 155)` | `oklch(52% 0.13 155)` | In process, active sources |
| `--red` | `oklch(68% 0.16 25)` | `oklch(54% 0.19 27)` | Rejected, failing sources, errors |
| `--on-accent` | `#1a0e05` | `#ffffff` | Text on an accent fill (the follow-up badge) |

All state colors clear 4.5:1 on the panel in both themes, so they work as text as well as glyphs. Color never carries meaning alone: every glyph has a distinct shape, and every state has a label nearby.

## Type

One family, Inter, loaded as a variable font with optical sizing. Code, commands and tool names use the system monospace stack. Numbers that line up in columns use `font-variant-numeric: tabular-nums`.

| Tokens | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `--fs-meta`, `--lh-meta` | 12 / 16 | 400, 500 | Meta, group headers, property labels, kbd |
| `--fs-ui`, `--lh-ui` | 13 / 20 | 400, 500 | Rows, sidebar, buttons, inputs on desktop, properties |
| `--fs-read`, `--lh-read` | 14 / 22 | 400 | Descriptions, notes, the profile |
| `--fs-title`, `--lh-title` | 20 / 28 | 600 | Job title, settings page title |

On touch screens (`pointer: coarse`) the UI steps up: rows use 15px titles and 13px meta, prose uses 15/24, and every input is 16px so iOS never zooms. Headings tighten tracking to -0.01em. Body text keeps 0.

## Space, radius, elevation

The spacing scale is 4px based: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48. Inside a group, gaps are 4 to 8px. Between groups, at least twice that.

| Radius | Value | Use |
| --- | --- | --- |
| `--r-xs` | 4px | Tokens, kbd, small badges |
| `--r-sm` | 6px | Buttons, inputs, rows, menu items |
| `--r-md` | 10px | Menus and popovers (6px items inside 4px padding) |
| `--r-lg` | 12px | The main panel, the command menu, dialogs |

Phone sheets round their top corners at 14px, the iOS sheet radius.

Depth comes from surface steps and hairlines, not from shadows. Shadows appear only on floating layers: menus and popovers (`--shadow-pop`), the command menu and dialogs (`--shadow-dialog`, over a scrim). In dark mode a raised layer also gets a 1px inner border, since shadows vanish on black.

## Motion

Motion explains a change or confirms a press. It never decorates, and it never runs on a keyboard action.

| Token | Value |
| --- | --- |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` |

- Menus and popovers open in 160ms with `--ease-out`, from `scale(0.97)` and opacity 0, with `transform-origin: var(--transform-origin)` so they grow out of their trigger. They close in 120ms.
- Dialogs scale from their center over 200ms and close in 150ms.
- Sheets on phones slide in over 260ms with `--ease-drawer`, and follow the finger when swiped down. A fast flick closes them sooner.
- Toasts rise 8px and fade in over 240ms, and leave in 150ms.
- Pressable controls scale to 0.97 on `:active` over 120ms.
- Hover feedback is a background change over 80 to 100ms. It lives inside `@media (hover: hover) and (pointer: fine)`.
- The command menu, j/k movement, row selection and detail swaps have no animation.
- An overlay opened from the keyboard (`s`, `f`, `?`, or Enter on a trigger) appears and leaves with no transition. `main.tsx` records the last input as `data-input="keyboard"` or `"pointer"` on `<html>`, and one rule in `overlays.css` turns the transitions off.
- Theme switches suppress all transitions for one frame so the page snaps instead of smearing.
- Under `prefers-reduced-motion: reduce`, movement goes away and short opacity fades stay.

## Layout

### Desktop, list

```
┌────────────────────┬──────────────────────────────────────────────────────────────────┐
│ ◉ Hunt        ⌕  + │ ▢ To review  30                [⌕ Search  /] [Remote] [7 days ▾] │
│                    ├──────────────────────────────────────────────────────────────────┤
│ ▢ To review     30 │ Today  12                                                         │
│ ☆ Shortlist      3 │ ○  Staff Software Engineer, Browser   Mozilla    Remote Canada ▰▰▱ 82  19h │
│ ➚ Applied        2 │ ○  Senior Software Engineer           Vannevar   Remote               22h │
│ ◷ Follow-ups     1 │ Yesterday  8                                                      │
│ ⊘ Skipped        1 │ ○  Software Developer (Backend SaaS)  Canonical  Remote, LATAM     1d │
│ ⊗ Rejected       1 │ …                                                                 │
│ ≡ All           37 │                                                                   │
│                    │                                                                   │
│ ● 1,009 sources    │                                                                   │
│   5 failing        │                                                                   │
│ ⚙ Settings    ◐    │                                                                   │
└────────────────────┴───────────────────────────────────────────────────────────────────┘
```

The sidebar sits on the window color. The main panel is inset 8px from the window edges, with a 12px radius and a 1px border. When the list is at least 900px wide, rows are 40px and single line, in columns: glyph, title, company, location, flags, verdict, age. The column tracks use `fr` units and fixed widths, never `auto`, so they line up across rows. Narrower lists use two-line rows, and a row with flags drops its location there. The list groups by posting day in To review and by status in Applied. Group headers stick to the top while you scroll.

### Desktop, list and job side by side (1240px and wider)

```
┌──────────┬────────────────────────┬─────────────────────────────────────────────────┐
│ sidebar  │ ▢ To review 30   ⌕ ▾   │ Mozilla › Staff Software Engineer…    ↑ ↓  ↗  ✕ │
│          ├────────────────────────┼─────────────────────────────────────────────────┤
│          │ Today                  │ Mozilla                       │ Status   ○ New  │
│          │ ○ Staff Software Eng…  │ Staff Software Engineer,      │ Verdict  ▰▰▱ 82 │
│          │   Mozilla  Remote …  82│ Browser (New Products)        │  Strong TS fit… │
│          │ ○ Senior Software Eng… │                               │ Follow up  Add  │
│          │   Vannevar  Remote  22h│ Description, 14/22, 68ch      │ Posted   19h ago│
│          │                        │ …                             │ Location Remote │
│          │                        │ Contacts                  Add │ Salary   —      │
│          │                        │ Activity                      │ Source   Green… │
│          │                        │ [ Leave a note…          ⌘↵ ] │ Posting  Open ↗ │
└──────────┴────────────────────────┴───────────────────────────────┴─────────────────┘
```

The list pane narrows to between 360 and 440px and its rows switch to two lines through a container query. The job pane shows its properties in a right column when it is at least 720px wide, and as a block under the title when it is narrower. Below 1240px the job takes over the main panel, with a back button and the view name in its header. Descriptions longer than about 640px fold behind a fade and a "Show the full description" button, so contacts and notes stay within reach.

### Phone (below 768px)

```
┌───────────────────────────┐      ┌───────────────────────────┐      ┌───────────────────────────┐
│ ◉  To review 30      ⌕  + │      │ ‹ To review          ↑ ↓ ⋯│      │ ───                       │
├───────────────────────────┤      ├───────────────────────────┤      │ Views                     │
│ Today                  12 │      │ Mozilla                   │      │ ⊘ Skipped               1 │
│ ○ Staff Software Engineer │      │ Staff Software Engineer,  │      │ ⊗ Rejected              1 │
│   Mozilla  Remote  ▰▰▱ 82 │      │ Browser (New Products)    │      │ ≡ All                  37 │
│ ○ Senior Software Engineer│      │                           │      │ Today                     │
│   Vannevar  Remote    22h │      │ Status        ○ New     › │      │ 33 new in the last day    │
│ Yesterday               8 │      │ Verdict       ▰▰▱ 82    › │      │ 1,009 sources, 5 failing  │
│ ○ Software Developer …    │      │ Follow up     Add date  › │      │ Settings                  │
│   Canonical  Remote    1d │      │ Posted        19 hours ago│      │ Connect agent           › │
│                           │      │ …                         │      │ Profile                 › │
│                           │      │ Description               │      │ Filters                 › │
├───────────────────────────┤      ├───────────────────────────┤      │ Sources                 › │
│ ▢     ☆     ➚     ◷    ⋯  │      │ [ ○ New ▾ ] [Open posting]│      │ Theme [System|Light|Dark] │
│Review Short Applied Due More│    └───────────────────────────┘      └───────────────────────────┘
└───────────────────────────┘
```

Phones get their own layout, not a squeezed desktop. A compact top bar holds the view name, search and track. A bottom tab bar holds the four daily views and More, in thumb reach. More opens a sheet with the other views, the day's summary, settings and the theme. A job opens full screen with a back button. Its status and the posting link sit in a sticky bottom bar. Rows are at least 56px tall, and every target is at least 44px. Bars pad themselves with `env(safe-area-inset-*)`, and they use a translucent material because content scrolls under them.

### Settings

```
┌────────────────────┬──────────────────────────────────────────────────────────┐
│ ‹ Back to jobs     │            Filters                                        │
│                    │            Hunt keeps only the jobs that pass these.     │
│ ⏚ Connect agent    │            ───────────────────────────────────────────── │
│ ▤ Profile        • │            Job titles                                     │
│ ⚟ Filters          │            Keep titles with      [software engineer ×] │
│ ⊙ Sources          │            Skip titles with      [intern ×] [co-op ×]  │
│                    │            ───────────────────────────────────────────── │
│                    │            Where you can work                             │
│                    │            On-site and hybrid                   [on ]    │
│                    │            …                                              │
│                    │            30 to review now, 21 with these   Reset  Save │
└────────────────────┴──────────────────────────────────────────────────────────┘
```

On phones, settings pages put "Settings" as the back button and center their title, as iOS does. Settings replace the sidebar's views with their own sections, Linear style. Pages are a 640px column. Sections are separated by hairlines. Each setting is a row with its label and help on the left and an inline control on the right. Rows stack on narrow screens. The sources table becomes two-line rows on phones, with one menu button per row instead of hover-only icons.

## Status glyphs

All glyphs are 16 by 16, drawn with `currentColor` and a 1.5px stroke, so they match the Lucide icons beside them. Shape carries the meaning. Color repeats it.

| Status | Shape | Color |
| --- | --- | --- |
| New | Empty ring | `--text-3` |
| Applied | Ring with a center dot | `--blue` |
| In process | Ring with a solid disc | `--green` |
| Rejected | Solid disc with an x cut out | `--red` |
| Skipped | Ring with a diagonal slash | `--text-3` |
| Closed | Solid disc with a bar cut out | `--text-3` |

A job that is new and closed shows the closed glyph. A job you acted on keeps its status glyph and shows "Closed" in its meta.

## Views

`src/model.ts` defines every view in one table: its path, label, icon, which server view feeds it, an optional client filter, and how it groups.

| View | Path | Source | Groups |
| --- | --- | --- | --- |
| To review | `/review` | `to_review` | Posting day |
| Shortlist | `/shortlist` | `shortlist` | None, best verdict first |
| Applied | `/applied` | `applied` | In process, then Applied |
| Follow-ups | `/follow-ups` | `applied`, follow-up date set | Due, then Later |
| Skipped | `/skipped` | `skipped` | None |
| Rejected | `/rejected` | `rejected` | None |
| All jobs | `/all` | `all` | None |

A job opens at `/<view>/<job id>`, so the list beside it keeps its context. Search, Remote and Posted live in the query string.

## Keyboard

| Key | Action |
| --- | --- |
| ⌘K or Ctrl K | Command menu: jump to a view or a job, change status, track a link, add a source, switch theme |
| / | Search the current view |
| j, k or ↓, ↑ | Move through jobs. With a job open, open the next or previous one. If a status change moved the open job out of the view, they continue from where it was |
| Enter | Open the highlighted job |
| Esc | Close the job, leave a field, close a menu |
| s | Status menu for the open job |
| 1 to 5 | With the status menu open, pick New, Applied, In process, Skipped or Rejected |
| f | Follow-up menu for the open job |
| o | Open the posting |
| n | Write a note |
| t | Track a job from a link |
| ? | Show these shortcuts |

## Rules

**Content.** Sentence case everywhere. Short and plain. No exclamation marks, no em dashes. Name controls by what they do ("Save filters", "Track job"). Errors say what went wrong and what to do next. Empty states give one next action.

**Rows.** A row is one link. Identifying text leads, metadata trails. Text truncates with an ellipsis and keeps its full value in the job view. Numbers never truncate.

**Controls.** One component per job: `Button` for actions, `Menu` for choices, `Sheet` for phone pickers, `TokenField` for phrase lists, `Switch` for booleans. Every control has hover, focus-visible, active, disabled and busy states. Icon-only buttons carry an `aria-label` and a tooltip on pointer devices.

**Primary actions.** At most one per view, drawn as an inverted neutral button (text color fill). The accent stays reserved for meaning.

**Touch.** Hover styles live only under `(hover: hover) and (pointer: fine)`. Nothing is hover-only. Targets are at least 44px on coarse pointers. Tap highlight is off and every control has its own `:active` state. The page never scrolls sideways at 360px.

**Overlays.** Menus, tooltips, dialogs, phone sheets and toasts come from Base UI (`@base-ui/react`). It is the one dependency the redesign added, at about 70kB gzipped. It earns that by handling focus, keyboard navigation, Escape, outside clicks and swipe-to-dismiss correctly, and by exposing `--transform-origin` so menus grow from their trigger. Overlays render in a portal, so scroll containers never clip them. A modal appears only for the command menu, the shortcuts list, phone sheets, and a destructive confirmation.

**Checking a change.** Look at 1440 and 1280 wide, 1024, and phones at 390 and 360, in both themes. Open a job, a menu, the command menu and a sheet. Nothing may scroll sideways at 360px.

**Undo over confirm.** Status changes show a toast with Undo. Removing a source asks first, because it deletes untouched jobs.

## Review against the brief and common defaults

The first draft of this plan went through the brief and the AI-default lists in the Anthropic, Impeccable and ibelick skills. These parts changed:

- Primary buttons were accent orange. That repeated the "loud orange button" the brief rejected and leaned toward the near-black-plus-one-bright-accent default. They are now neutral, and the accent only marks what needs you.
- The sidebar had a 14-day sparkline for "today". It was a chart standing in for content. The posting-day groups in To review carry the same information, so it was cut.
- Row meta read "Company · Location" with middle dots. Wide rows now use columns and narrow rows use spacing and two text levels.
- The status glyphs were pie wedges, which is Linear's own language. They now grow out of Hunt's ring-and-dot mark.
- Phone navigation was a row of tabs at the top. It moved to a bottom tab bar in thumb reach, with a sheet for the rest.
- Group headers were small caps labels. They are sentence case at 12px with a quiet count.

The dark palette keeps the near-blacks the project already used (`#0f0f0f` to `#131313`), as the brief asked.
