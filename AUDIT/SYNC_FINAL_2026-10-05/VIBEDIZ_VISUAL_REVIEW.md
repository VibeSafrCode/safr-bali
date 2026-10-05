# Public cutover visual review — 2026-10-05

Scope: read-only inspection of 12 saved screenshots supplied by the primary conversation. No browser launch, source edit, production access or semantic/legal validation.

Inspected: e33g-ru-1280-light/dark, e33g-ar-375-dark, e33g-ar-1280-dark, e33g-en-375-light, e33g-hi-375-light, e33g-de-820-dark, e33g-ja-820-light, e33g-zh-Hans-375-dark, language-ar-mobile, comparison-ar-table0/1.

## Concrete visual defects for correction
1. P2 — RU desktop header: Help wraps onto a second navigation row at 1280px, increasing header height relative to English. Founder requested a one-row header. Reduce gaps/padding or collapse the account label earlier, preserving 44px touch targets and avoiding horizontal overflow.
2. P2 — Chinese mobile language button: 中文 wraps vertically onto two lines. Keep the short label unbroken and prevent flex shrinking; balance header gaps to retain all controls.
3. P2 — Both Arabic mobile comparison tables: clipped edge cells and the off-screen VOA column have no visible horizontal-scroll affordance. Preserve intended table overflow, add a subtle visible instruction/edge cue, and capture the opposite horizontal edge to confirm access to all columns. These screenshots alone do not establish data loss.

## Shown checks
- Warm dark article surfaces and text contrast appear readable.
- H1, direct-answer and visible fact blocks do not overlap.
- RTL block alignment and visible IDR/USD amounts are readable.
- The language bottom sheet has exactly two columns and five fully visible rows; selected Arabic, close control and footer fit.

## Optional hierarchy notes
The complete family notice before H1 consumes substantial mobile height, pushing the page subject down. Consider placing it after direct answer only if permitted by presentation decisions; preserve its full approved text. Mixed English/Arabic title punctuation could benefit from bidi isolation without copy changes.

## Evidence limits
The viewport screenshots do not show the full pricing cards or per-person caption. Those parts, keyboard/screen-reader interaction, other routes and the new admin/customer preview are not visually approved by this review. Recheck only corrected relevant frames plus the missing pricing/preview evidence.

## Targeted recheck
All three initial P2 defects are visually closed in updated RU1280, ZH320 and both Arabic table start/opposite-edge frames. H1 now precedes the family qualification on the main page. RU desktop tariff cards and RU/AR per-person captions are readable. Customer-preview frames at 390/820/1440 show an explicit administrator viewing banner, device controls, the actual account surface and readable countdowns.

Two newly observed blockers remain:
- Home/Vietnam 375 and 820: second-row country images overlap first-row country labels, particularly UAE. Grid rows must include image, label and gap, not only image height. Desktop six-in-one-row view is unaffected.
- Arabic 375 standard price card, both themes: IDR/approximate USD fragment, parentheses and Arabic prefix reorder across a line break. Isolate monetary text with LTR bidi boundaries and keep each number/currency pair together; preserve approved values and copy.

The requested admin service tiles frame has not arrived yet. No final visual PASS for these remaining items; no new browser was opened.

## Final saved-frame result
PASS for the reviewed presentation scope. Updated home-820-light and vietnam-375-dark show full first-row labels and clear space before row two. Updated price-unit-ar-375-light/dark show the complete monetary fragment on its own line, with readable amounts, currency and parentheses. admin-service-tiles-desktop shows the visa icon and a large 331-day ring in the same compact tile style as bike, housing and insurance; no visible collision. Previously inspected client-preview 390/820/1440 frames remain readable. All five visual defects recorded in this review are closed by the supplied evidence.

This is saved-frame presentation approval, not independent execution of the primary browser suite, native-language/legal approval or production release. The primary reports synthetic preview PASS with no real data or writes. Production remains unchanged.

## Analytics addendum — saved-frame review
Inspected admin-analytics-owner-desktop.png and admin-analytics-staff-desktop.png. Existing public and client-preview/admin-tile visual approvals remain unchanged.

Analytics presentation: NEEDS POLISH, not visual PASS. Owner history and staff unavailable-history state are distinct; staff aggregates remain visible. This verifies only what the screenshots display, not authorization enforcement.

P2 corrections:
1. Date labels touch small native inputs; controls use two rows and Refresh is a thin full-width grey bar. Compose a compact desktop date-range toolbar with consistent admin input/button styling and usable control height.
2. Aggregate and history table cells lack padding and row separation; headings and values visually merge. Reuse admin table spacing/alignment, numeric tabular figures and row dividers while retaining intentional horizontal overflow.
3. Human-readable labels should replace visible owner/assigned_services and redundant server-access wording. Use Owner/Assigned services and Summary for the period; backend enum values remain unchanged.

No source, UI, production data or browser changes were made. A corrected desktop frame for each role is sufficient for targeted visual recheck; this is a separate analytics presentation gate.

## Analytics final targeted recheck
PASS for the two updated desktop screenshots (owner and staff). All three analytics presentation findings are closed: date controls and Refresh now share a compact aligned row with separated labels; both tables have clear padding, header/row dividers and readable columns; visible access labels are human-readable and the duplicate server-access line is removed. Owner history is visible; staff retains the summary and a clear unavailable-history message. The warm dark panel styling matches the admin surface without visible overlap or clipping in the supplied frames.

This supersedes the earlier analytics NEEDS POLISH result for desktop presentation only. Mobile/tablet analytics, keyboard behavior, server authorization and live production were not independently verified in this screenshot review. No new source edits, browser launches or production operations were performed. Prior public, service tile and client preview visual approvals remain unchanged.
