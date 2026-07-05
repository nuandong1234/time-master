Status: ready-for-agent

## Parent

- [PRD: 设置页面布局优化](file:///g:/time-master/.scratch/settings-layout-redesign/PRD.md)

## What to build

Single vertical slice that restructures the settings page layout and updates button colors in one go.

**Layout changes:**
- Change from single-column scroll to two-column CSS Grid (system + general side by side, data management full-width)
- Remove colored dot decorations from section titles, use plain bold text with bottom border
- Change theme selector from horizontal to vertical layout
- Remove "About" section and version number from page bottom

**Visual changes:**
- Change export button to brand blue (`bg-blue-600`)
- Change secondary buttons (import, open folder) to outline style (`border border-border bg-background`)
- Inline data storage path text and "open folder" button into one row
- Remove red border/background from danger zone, replace with red button + gray description text (matching import layout)

Only one file is modified. No backend or store changes.

## Acceptance criteria

- [ ] System and General sections display side by side in a two-column grid
- [ ] Section titles have no colored dots, only bold text + bottom border
- [ ] Theme selector buttons are stacked vertically (not horizontal)
- [ ] Export button uses brand blue color
- [ ] Import and "open folder" buttons use outline style (border only, no background)
- [ ] Data storage path and "open folder" button are on the same row
- [ ] Danger zone has no red border/background, only a red button + gray text
- [ ] "About" section and version number are removed
- [ ] Layout works correctly in both main window and standalone 640px settings window
- [ ] All colors work in dark mode

## Blocked by

None - can start immediately