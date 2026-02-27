# Frontend Design Principles

Visual design conventions for PangyPlot's HTML/CSS frontend.

---

## Color System

All colors are defined as CSS custom properties in `:root` (`style.css`). Nothing is hardcoded outside of component-specific overrides.

| Variable | Value | Role |
|---|---|---|
| `--site-background` | `#eee` | Page background |
| `--highlight` | `#FFE268` | Selection, hover, active states (gold/yellow) |
| `--error` | `#6c261d` | Error borders |
| `--darker-green` | `#384034` | Deepest green — logo background, active button press |
| `--dark-green` | `#5D6C53` | Borders, dividers, emphasis |
| `--light-green` | `#93AC9D` | Container titles, button surfaces, cytoband fills |
| `--lighter-green` | `#BCCCC2` | Container backgrounds, empty graph area |
| `--text-color` | `#384034` | Primary text (same as `--darker-green`) |
| `--tab-box` | `rgba(225,225,225,0.8)` | Tab panel backgrounds (semi-transparent) |
| `--unselected-green` | `#9ba8a0` | Unselected option buttons |
| `--unselected-text` | `#747e77` | Dimmed text on unselected options |
| `--debug-bg` | `#ffe8e8` | Debug panel background (light red) |

The palette is a muted green/sage theme with gold highlights. The green tones evoke biology/nature (appropriate for a genomics tool) without being clinical.

### Cytoband Colors

Cytoband fills remap the standard UCSC grayscale scheme to the green palette:

- `gneg` → `#F6FFF9` (near-white green)
- `gpos25/33` → `#8AD4AB`
- `gpos50` → `#539971`
- `gpos66/75` → `#2A7D4F`
- `gpos100` → `#09341B` (near-black green)
- `acen` → `#DEA938` (gold, centromere)
- `gvar` → `#FFE268` (highlight yellow)
- `stalk` → `#E7CA56`

---

## Typography

- **Font family**: Rubik (self-hosted TTF — regular, bold, italic weights)
- Monospace used for: version overlay, slider values, debug panels, citations, code/sequence displays (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`)
- Font sizes use keyword scale (`x-small`, `small`, `large`, `x-large`, `xx-large`) rather than px/rem — quick to write but less precise

---

## Layout System

Layout is a custom flexbox utility system, not a third-party framework:

| Class | Behavior |
|---|---|
| `.flex-row` | Horizontal, centered, 10px gap |
| `.flex-row-left` | Horizontal, left-aligned |
| `.flex-row-right` | Horizontal, right-aligned |
| `.flex-col` | Vertical, centered, 10px gap |
| `.flex-0` through `.flex-9` | Flex grow ratios |
| `.fixed-height-1` / `.fixed-height-2` | Fixed-height rows (120px / 300px) |

The page stacks vertically: navbar → cytoband → search/coordinates row → graph area → color picker. Horizontal subdivisions use flex ratios.

No CSS grid is used (except in `information-panel.css`'s `#info-selected-container`). No media queries — the layout is desktop-only.

---

## Component Patterns

### Containers

The `.container` class is the primary visual grouping element:
- `--lighter-green` background, `5px` border-radius
- Optional `.container-title` bar: `--light-green` background, bold centered text, fixed `--title-height` (20px)
- `.container-content` provides 10px margin with height calculated as `calc(100% - title - margins)`
- Scrollbars are hidden across all browsers (webkit + Firefox + IE)

### Buttons

Two button systems:

1. **`.button-style`** — general-purpose buttons
   - `--light-green` background → `--highlight` on hover → `--darker-green` with scale(0.95) on active
   - Includes box-shadow press effect
   - `.button-selected` adds persistent highlight + shadow

2. **`.option-button`** — radio-style toggle buttons
   - `.option-button-unselected` → dimmed green with muted text
   - `.option-button-selected` → highlight yellow with shadow
   - Actual `<input type="radio">` elements are hidden; styling is on wrapper divs

### Tabs

Right-side panel with icon-only tab buttons (FontAwesome icons):
- `.tab-button` — transparent-ish background, highlight on hover/active
- `.tab-content` — `max-width: 20vw`, semi-transparent background, scrollable
- Tab switching done via `switchTab()` with `.hidden` class toggle

### Modals

Standard overlay pattern:
- Fixed full-screen backdrop (`rgba(0,0,0,0.4)`)
- White content box, `45%` width, centered
- Close button is `&times;` character with hover darkening

### Context Menu

Custom right-click menu:
- Absolute positioned, `--tab-box` background, slight shadow
- Category labels are bold with bottom border
- Rows highlight on hover

### Tooltips

Two patterns:
- **Hover tooltip** (graph): absolute-positioned, follows cursor, icon + text with gap
- **CSS-only tooltip** (search table): `::after` pseudo-element with `data-tooltip` attribute, multiline via `white-space: pre`

---

## Iconography

- **FontAwesome 6** (self-hosted) for all icons — no inline SVGs for UI chrome
- Custom SVG illustrations for: logo, mascot ("pangy"), option button graphics (base composition, allele frequency, etc.)
- Favicon is SVG
- Organism indicator uses emoji with text-shadow

---

## Interaction Design

- **Hover**: `--highlight` yellow background is the universal hover indicator
- **Active/press**: `scale(0.95)` transform + darker background + box-shadow
- **Transitions**: `0.2s–0.3s ease` on background-color and transforms
- **Error state**: `.error-input` border color, `.shake` keyframe animation (2 quick shakes)
- **Loading**: CSS spinner (border-top trick, 1s linear infinite), semi-transparent overlay filter
- **Empty state**: Dashed `--light-green` border, centered mascot SVG + "Waiting for query..." text
- **Copy feedback**: `#copyPopup` tooltip with 0.5s opacity fade

---

## What's Working Well

1. **Consistent color vocabulary**: everything references CSS variables — changing the palette is a single `:root` edit
2. **Distinct interaction language**: highlight-yellow hover/select is instantly recognizable across every component
3. **Lightweight layout**: the flex utility classes avoid framework bloat and are easy to compose in templates
4. **Self-hosted fonts + icons**: no external CDN dependencies, works offline
5. **Scientific character**: the green/gold palette and Rubik font strike a balance between approachable and professional for a bioinformatics tool
6. **Clean component separation**: each component (cytoband, tabs, gene search, etc.) has its own CSS file matching its template

---

## Suggested Improvements

### Responsiveness
There are no media queries or responsive breakpoints. The app is desktop-only. For wider adoption:
- Consider a minimum viable tablet layout (collapse side tabs below the graph)
- Add `max-width` / `min-width` guards to prevent layout breakage on narrow windows
- The gene search result slots (4 fixed placeholders) could wrap or collapse

### Font sizing consistency
Font sizes use keyword values (`small`, `large`, `xx-large`) throughout, which vary across browsers. Switching to a rem-based type scale would give more control:
```css
--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-base: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.25rem;
```

### Scrollbar hiding
Hidden scrollbars (`.container`) hurt discoverability — users may not realize content is scrollable. Consider styled thin scrollbars instead:
```css
scrollbar-width: thin;
scrollbar-color: var(--light-green) transparent;
```

### Accessibility
- No `:focus-visible` styles on interactive elements (keyboard navigation is invisible except on `.selectable-table tr:focus`)
- Color contrast: `--unselected-text` (#747e77) on `--unselected-green` (#9ba8a0) may fail WCAG AA
- Hidden radio inputs lose keyboard accessibility — consider `appearance: none` with visible custom styling instead of `display: none`
- The `--highlight` yellow on `--lighter-green` backgrounds may be low-contrast for text
- Missing `aria-label` or `aria-describedby` on icon-only tab buttons

### Dark mode potential
The variable-driven color system is already 90% of the way to supporting a dark mode. A `[data-theme="dark"]` selector block remapping the `:root` variables would be relatively low-effort.

---

## CSS Formatting Style Guide

Rules for writing and organizing CSS in PangyPlot.

### Colors

- **Never hardcode** hex, rgb, or named colors in component CSS. Always use a `:root` variable from `style.css`.
- If a new semantic color is needed, add it to `:root` first, then reference it.
- The only exception is `rgba()` overlays where the base must be neutral (e.g., `rgba(0,0,0,0.4)` for modal backdrop, `rgba(255,255,255,0.4)` for loader filter). These are acceptable because they are opacity layers over arbitrary content, not themed surface colors.

### Font sizes

- Use CSS keyword sizes: `x-small`, `small`, `large`, `x-large`, `xx-large`.
- Never use `px` for font sizes.
- `em`-based sizes are acceptable when relative scaling to a parent is genuinely needed (e.g., `.info-label` at `0.85em`), but prefer keywords for standalone elements.

### Font families

- Body text: inherited from `body { font-family: 'Rubik', sans-serif; }` — no need to redeclare.
- Monospace: always use the full stack: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. Never use bare `monospace`.

### Selectors and naming

- **IDs** for unique page elements (`#graph-container`, `#go-button`).
- **Classes** for reusable patterns (`.button-style`, `.flex-row`, `.container`).
- Use hyphen-case for all class and ID names (`gene-search-bar`, not `geneSearchBar`).
- Component-scoped names are prefixed with the component name (`cytoband-genome-text`, `gene-search-item-name`, `modal-info-row`).

### File organization

- One CSS file per component/template, loaded via `<link>` in the corresponding template.
- Global utilities and variables live in `style.css`.
- Font declarations live in `fonts.css`.
- File location mirrors the template structure:
  - `css/ui/` — UI components (navbar, modal, coordinates, gene search, color picker)
  - `css/ui/tabs/` — tab panel content styles
  - `css/ui/utils/` — reusable UI primitives (slider, selectable table)
  - `css/graph/` — graph canvas and overlays
  - `css/cytoband/` — chromosome ideogram

### Inline styles

- **No inline `style=` attributes** in templates. Extract to a CSS class instead.
- The `.hidden { display: none !important; }` utility class is the standard way to hide elements. Do not use `style="display:none"`.

### Layout

- Use the flex utility classes (`.flex-row`, `.flex-col`, `.flex-1`–`.flex-9`) for layout composition.
- Use `flex` ratios rather than fixed widths where possible.
- CSS grid is acceptable for data-heavy layouts (tables, info panels) but flex is the default.

### Spacing

- `10px` is the standard gap for flex rows/columns and container margins.
- `5px` is the standard small padding (buttons, pills, badges).
- `border-radius: 5px` is the universal corner radius. Use `3px` only for small inline elements (slider values, pills).

### Transitions

- Use `0.2s ease` for button/interactive transitions.
- Use `0.3s` for background-color transitions on larger surfaces (tabs, option buttons).
- Never use transitions longer than `0.5s` outside of deliberate animations.

### Shadows

- Interactive press: `box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3)`.
- Dropdown/popup: `box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2)`.
- Context menu: `box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15)`.

### State classes

| Class | Purpose |
|---|---|
| `.hidden` | Hide element (`display: none !important`) |
| `.highlighted` | Apply highlight background |
| `.button-selected` | Persistent selected state for buttons |
| `.active-tab-button` | Currently active tab |
| `.error-input` | Error border on form inputs |
| `.shake` | Error shake animation |
| `.no-data` | Italic dimmed text for empty states |

### Things to avoid

- `!important` — only acceptable in utility overrides (`.hidden`) and specificity escapes for third-party conflicts. Never in component styles.
- Vendor prefixes beyond what's strictly needed (the codebase currently includes `-ms-overflow-style` and `-webkit-user-select` which are fine for scroll/selection, but don't add new ones without reason).
- Deeply nested selectors — keep specificity flat. Prefer `.component-element` over `.component .sub .element`.
