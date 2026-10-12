# Home screen visual QA

final result: passed

Source: C:/Users/bhavn/Downloads/Mobile Devices/file_000000000fdc820891c2803e6dbc3d8f.png (846 × 1860).
Implementation: outputs/home-mobile.png, rendered in Codex in-app browser at http://localhost:3001/.
Viewport: 423 × 893 CSS pixels. Source device status bar excluded by cropping the first 74 image pixels, then reducing 846 × 1786 to 423 × 893. Browser capture normalized to the same size for comparison. Device chrome is owned by the user's device, not duplicated in the web app.
State: Paonta Sahib branch, New loans, Pending, Today summary. Live branch has zero records; reference's example counts were not substituted for live records.

## Evidence and findings

Full-view comparison: outputs/home-comparison.png (source left, implementation right).
Focused summary comparison: outputs/home-summary-comparison.png.
No remaining actionable P0/P1/P2 findings. Landscape, three summary cards, pagination, add button, category tabs, search, filters and illustrated empty state follow the reference's composition.

- Typography: Times New Roman matches the supplied serif lettering; branch/menu/form controls retain the app's established sans font. Checked headline, numerals, date and empty-state copy.
- Spacing: central card starts at y119, Add Loan at y302, tabs at y391, search at y455. Source target positions after normalization are approximately y119, y301, y390 and y453. Empty illustration and caption occupy the reference's lower region.
- Colors: pale mint landscape, forest green cards, mint check icons, amber clock icons, offwhite page and orange filter counter.
- Images: generated landscape and botanical backgrounds are real raster assets. Empty illustration has transparent alpha and thin strokes. Minor illustrated detail differences remain as P3 polish; these are recreated assets, not pixel-identical copies.
- Copy: Add Loan / New loan or renewal, New loans / Renewals, Search ATS or name..., Nothing pending / Choose All to see every application match the reference. Summary counts and date use live data and India time.

## Comparison history

Initial comparison: outputs/home-comparison-before.png. Found excessive sky shifting sun/mountains down (P2), rectangular empty-art background and undersized artwork (P2), overly heavy serif shapes (P2), and excess caption spacing (P2).
Fixes: landscape moved up 31px; transparent thin-line illustration replaced original generated art and its rendered bounds enlarged; font changed to Times New Roman; inherited heading bottom margin removed and caption gap reduced.
Post-fix comparison: outputs/home-comparison.png. Confirmed latest CSS in the browser (background-position 50% -31px; paragraph margin-top 6px).

## Functional verification

- Branch selection loads home.
- Add Loan opens type chooser; Renewal opens existing renewal form with selected branch. Cancel closes without creating records.
- New loans and Renewals switch panels.
- Filter button opens the existing status selector and Clear all/Done actions.
- All Time pagination centers its card; Today restores the default composition.
- Search shows No matching loans; clearing restores Nothing pending.
- Desktop rendered at 1024 × 900; mobile at 423 × 893. No clipped primary controls or framework error overlay.
- Initial dateTime hydration warning traced to rendering a fresh timestamp on server/client. Corrected by initializing clock after mount. Final production origin has no console errors or warnings.
- Production build passed with TypeScript validation; all 12 tests passed, including India date/month boundary and sanction-update aggregation tests.

## Limits and follow-up polish

P3: generated mountain/leaf contours differ slightly from source art. Browser capture is softer than source raster. Actual counts depend on the selected branch. No production writes or deployment performed. Admin edit/save flows unchanged and not retested for this visual change.

## Implementation checklist

- [x] Preserve existing loan forms and settings.
- [x] Render responsive reference layout with working controls.
- [x] Verify mobile and desktop screenshots.
- [x] Fix substantive comparison findings and date hydration warning.
- [x] Verify build, type checking and tests.
- [x] Keep local production preview running.

## Asset provenance

Built-in imagegen used for public/home-landscape.png, public/home-botanical.png and public/home-empty.png. Prompts requested the exact supplied image's landscape without UI, dark forest-green subtle leaf texture without UI, and transparent thin-line document/branch/field empty illustration without text, respectively. Source screenshot supplied to each generation/edit.

## Narrow phone follow-up — 12 Oct 2026

final result: passed

- Source visual: `/tmp/codex-remote-attachments/01a13148-6056-7757-804d-da0a5a903045/edbee2e1-a51a-41e2-b006-3036676337c0/1-1000580716.jpg` (582 × 1280). The 51px device status bar was cropped, then the app content was normalized to 360 × 760 in `/tmp/amcc-reference-normalized.png`.
- Implementation: `/tmp/amcc-target-360.png` (360 × 792, 1× density) at `http://localhost:3001/`; its first 760px were compared in `/tmp/amcc-comparison.png`. The enlarged top section is in `/tmp/amcc-comparison-top.png`.
- State: Paonta Sahib, New loans, Pending, Today summary, empty list. Counts and date remain live and therefore differ from the reference examples.
- Spacing: after normalization, the reference and implementation place the featured card at about y101, Add Loan at y257, tabs at y333, search at y387, and the empty caption at y606. The rendered illustration and controls have the intended narrower proportions.
- Typography, colors, imagery, copy: the serif hierarchy and labels follow the reference. Existing generated landscape, botanical, and empty state art retain minor contour and texture differences (P3).
- Interaction and responsive checks: Add Loan chooser, carousel selection, and filter panel worked at 360px. No JavaScript console errors or horizontal overflow at 320, 360, 390, 423, 600, or 1024px.
- Comparison history: the earlier live narrow-phone layout kept the 423px card, button, controls, and artwork sizes, making them visually oversized. Scaling those dimensions with viewport width fixed the P2 density mismatch. The final full-view and focused comparisons show no remaining P0/P1/P2 issues.
