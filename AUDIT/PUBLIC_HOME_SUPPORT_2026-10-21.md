# Mobile HOME support — 21 October 2026

Status: local implementation and affected rendered checks accepted. New Git CI,
coupled release candidate and production verification are still separate gates.

## Exact scope

- Replace the floating HOME support button at widths <=699px with an in-flow
  native button after the active service grid, using the existing localized
  support caption. Header-menu Help remains available.
- Preserve desktop HOME and mobile article floating support.
- Return Escape focus to the visible opener, or the visible menu toggle when
  opening Help closed and hid its menu opener.
- Keep long translated HOME service labels inside their own cards. No font,
  columns, editorial copy, service URLs, pricing, auth or submission changes.
- Add browser regressions for label hit targets/bounds, dialog fit, methods,
  draft preservation, Escape focus and unchanged desktop/article behavior.

## Evidence and limitations

Fresh isolated public-input copy: 2651 build-source rows, exactly four product
source deltas, catalog/export/Astro check/build all exit0; 2323 raw output files
and 1100 HTML files. Dependencies were selected and pinned, not a complete
hermetic dependency closure. The in-process guard blocked two net API calls in
the catalog process; no destination was recorded, so this is not a claim that
all calls were externally addressed or that an OS network sandbox was proved.

Actual existing-browser checks: FR/DE/ES/AR/JA at320px have no horizontal document
overflow or overlapping service labels. Four measured dialogs are294px wide
with294px scroll width and222px descriptions; title focus and Escape return to
the in-flow opener work, contact fields remain blank. Independent Designer
review of nine affected frames found no new P1/P2. The initial FR collision was
preserved as a failing observation and closed only after a fresh source/build
and rendered result. Long words may wrap mid-word at the existing phone font.

Additional actual observations: RU menu Help closes the menu and Escape returns
to its visible toggle; light-theme opener has a painted focus ring;699px shows
the in-flow entry and hides the FAB,700px does the opposite. Desktop HOME1280px
and article320px retain FAB opening/title focus/Escape return. No submissions,
external contact clicks, real accounts, leads or messages were used. This is
not full accessibility, every route, touch-device or delivery verification.

All-file CSS:178769 raw /31234 gzip bytes, below unchanged180000/32000 caps.
All JS/MJS:71991/29139, below unchanged caps. Exact reviewed CSS pins updated;
negative source/output drift, missing/duplicate inventory and growth checks
remain active. Four asset-budget tests passed.

Historical03/77 chats remain Founder-deferred and were not messaged. Current
bounded technical/Designer contributors provided source and actual-frame review;
their findings were integrated, not treated as a production approval chain.

The raw build is not a coupled candidate. Retain every previously served
immutable asset, including the newly superseded CSS and support JS, and the
approved public hero before any static switch. Do not reuse the old retained
asset count without a complete inventory. Installed runtime and actual search
indexing remain separate, with actual indexing deferred by Founder.
