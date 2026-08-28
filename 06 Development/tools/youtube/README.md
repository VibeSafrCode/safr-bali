# SAFRWAY YouTube operator tool

This folder contains a Founder-operated, deterministic YouTube workflow. It
does not use an LLM and it is not part of the website runtime.

Security boundaries:

- OAuth, raw inventory, classification, plan and apply journal files must stay
  in one dedicated directory outside the repository. Create it yourself with
  exact mode `0700`; the CLI refuses shared, permissive and symlinked parents.
- Every private file is atomically written with exact mode `0600`. The CLI
  never changes permissions on an existing parent directory.
- Read-only authorization is a separate step from playlist mutation.
- The actual scopes returned by Google must exactly match the selected
  read-only or management profile; editing the local profile label is not
  sufficient.
- Playlist changes require an exact approved plan SHA-256.
- Apply holds a nonblocking exclusive lock beside the private journal from the
  first preflight read through the last journal/API mutation. A concurrent
  apply for the same journal is rejected.
- Apply is additive-only: it never removes a video or deletes a playlist.
- Every target playlist's exact privacy is bound into the approved plan and
  verified live. Targets and newly created playlists must remain `private`;
  publication is a separate human-reviewed gate not performed by this CLI.
- Apply writes an atomic private journal before and after every mutation. A
  transport failure is recorded as `unknown`; rerunning reconciles live state
  before attempting anything again. An UNKNOWN add is never posted again just
  because one membership read is empty: wait until membership is positively
  visible, or obtain a new Founder decision and pass the one-attempt token
  printed by the CLI as `--approve-unknown-add-retry INDEX:ATTEMPT`. That
  decision is persisted in the journal before the retry. YouTube changes are
  not transactional and are never described as rolled back.
- The VPS receives only a reviewed snapshot of public videos. Private/unlisted
  videos, unresolved classifications, tags/statistics and unsafe thumbnails
  are never exported.

Before the first run, create a dedicated local directory outside the checkout
and copy the Google Desktop OAuth client into it:

```text
mkdir -m 700 /absolute/private/safrway-youtube
chmod 600 /absolute/private/safrway-youtube/client.json
```

Do not use `/tmp`, Downloads, the repository, a shared folder or a symlink as
that directory.

The first Founder run will be guided from the primary Bali conversation. The
expected sequence is:

```text
python3 youtube_cli.py auth --scope readonly --client-json /absolute/private/safrway-youtube/client.json --token-file /absolute/private/safrway-youtube/readonly-token.json
python3 youtube_cli.py inventory --token-file /absolute/private/safrway-youtube/readonly-token.json --out /absolute/private/safrway-youtube/inventory.json
python3 youtube_cli.py classify --inventory /absolute/private/safrway-youtube/inventory.json --rules rules.v1.json --out /absolute/private/safrway-youtube/classification.json
python3 youtube_cli.py plan-playlists --inventory /absolute/private/safrway-youtube/inventory.json --classification /absolute/private/safrway-youtube/classification.json --out /absolute/private/safrway-youtube/plan.json
```

Classification uses deterministic Unicode-aware word/phrase boundaries. A
trailing `*` in a rule is an explicit word-prefix match. Unknown, tied and
low-margin public videos stop plan creation until the Founder adds an explicit
override. An override with an empty topic list means “reviewed: do not place”.
The plan includes each title and exact match evidence for human review.

After Founder review, authorize the management scope separately and apply the
exact immutable plan:

```text
python3 youtube_cli.py auth --scope manage --client-json /absolute/private/safrway-youtube/client.json --token-file /absolute/private/safrway-youtube/manage-token.json
python3 youtube_cli.py apply --token-file /absolute/private/safrway-youtube/manage-token.json --plan /absolute/private/safrway-youtube/plan.json --journal /absolute/private/safrway-youtube/apply-journal.json --approved-plan-sha256 <SHA256>
```

`export-site-snapshot` produces only public video metadata and route mappings.
It validates the exact inventory/classification channel and hash, removes
contact-like data, bounds descriptions and allowlists HTTPS YouTube thumbnail
hosts. Its output is the only artifact intended for review and possible commit:

```text
python3 youtube_cli.py export-site-snapshot --inventory /absolute/private/safrway-youtube/inventory.json --classification /absolute/private/safrway-youtube/classification.json --out /path/to/reviewed/site-snapshot.json
```
