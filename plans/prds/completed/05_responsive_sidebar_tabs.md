# PRD: Responsive Sidebar Tabs

**Owner:** Ben · **Target:** post-MVP polish · **Platform:** Obsidian desktop only

## 1. Problem

The Obsidian sidebar is resizable. When the user narrows the sidebar below ~180px, the
three tab labels ("Now Playing", "Queue", "Library") no longer fit in their `flex: 1`
buttons — text overflows or wraps into ugly multi-line buttons. The user can't read
the labels, the layout breaks, and the experience degrades.

## 2. Solution

When the sidebar shrinks past a breakpoint, collapse the three tab `<button>` elements
into a single native `<select>` dropdown that shows the active tab's label. When the
sidebar widens again, restore the full button row. The change is **purely visual** —
no tab-switching logic or state persistence changes.

## 3. Goals

- A clean, readable tab switcher at any sidebar width.
- Zero user interaction to trigger — automatic via `ResizeObserver`.
- Matches Obsidian's existing dropdown pattern (uses Obsidian CSS variables).
- No scroll-bar, no wrapping, no cut-off text at any width.

## 4. Non-goals

- A custom fancy dropdown widget (native `<select>` is fine).
- Dropdown state persistence — the dropdown is transient based on width, never stored.
- Adding any new runtime dependencies.

## 5. Functional requirements

- **FR-1** A `ResizeObserver` on the `navidrome-tabbar` div watches for width changes.
  The callback ignores width `0` (the bar is `display:none` while `is-searching`) so
  search entry/exit never thrashes the collapsed state.
- **FR-2** Below a breakpoint (~180px; tuned so none of the three labels wrap), the bar
  gets an `is-collapsed` class. CSS hides the three `<button>` elements and shows a
  single `<select>` (created once at init) whose options are the three tab labels.
- **FR-3** The `<select>` always reflects the active tab. Its value is set inside
  `switchTab()` — not only in the observer — so it stays correct even when the tab is
  changed programmatically (e.g. the `switchTab(activeTab)` call in `onOpen()`).
- **FR-4** On `<select>` change, `switchTab()` is called — same code path as a button
  `onclick`.
- **FR-5** When the tab bar exceeds the breakpoint, `is-collapsed` is removed; CSS
  restores the `<button>` row and hides the `<select>`.
- **FR-6** The `<select>` uses Obsidian's built-in `dropdown` class so it inherits the
  theme's select styling (background, text, accent, border) in light and dark mode with
  no hand-rolled variable mapping. It carries an `aria-label` so the collapsed control
  is announced meaningfully.

## 6. UX requirements

- The transition must be instant — no animation, just hide/show.
- The dropdown must be full-width for easy tap/click.
- When switching from dropdown back to buttons, the correct button must show `is-active`.
- The search overlay (`is-searching` class) hides the tab bar entirely; that behavior
  is unaffected.

## 7. Technical approach

```
onOpen():
  create <select class="dropdown"> inside seg (one <option> per tab), aria-label set
  select.onchange -> switchTab(select.value)
  ResizeObserver on seg:
    width = seg.clientWidth
    if width === 0: return            // bar is hidden (is-searching)
    seg.toggleClass("is-collapsed", width < BREAKPOINT)

switchTab(id):
  ...existing body/is-active/persistence...
  tabSelect.value = id               // keep dropdown in sync on every switch
```

- Show/hide is driven by the `is-collapsed` class in CSS, matching the existing
  `is-searching` / `is-active` class-toggle idiom — no inline `display` juggling in JS.
- The `<select>` is created once at init and reused; never removed from DOM.
- `switchTab()` is reused directly — no new logic path — and additionally sets the
  dropdown value so button and dropdown are always consistent.
- `onClose()` currently only tears down `nowPlayingTab` / `queueTab`; add an explicit
  `tabbarResizeObs?.disconnect()` there (following the `nowPlaying.ts` destroy pattern).

## 8. Acceptance criteria

- [ ] Tab bar shows three labelled buttons at the default sidebar width (~300px).
- [ ] Narrowing the sidebar below ~180px collapses buttons into a single dropdown.
- [ ] The dropdown label matches the active tab, and selecting a different option
  switches tabs correctly (bodies change, listeners fire, persistence works).
- [ ] Stretching the sidebar back out restores the three buttons with the correct
  `is-active` state.
- [ ] Tab bodies and playback are unaffected during collapse/expand.
- [ ] Styling matches the Obsidian theme in both light and dark mode.
- [ ] Entering/exiting search (which hides the whole tab bar) does not flip the
  collapsed state or flash the dropdown on exit.
- [ ] No console errors or `ResizeObserver loop` warnings on load, collapse, expand,
  search, or unload.
- [ ] `npm run build` passes cleanly.
