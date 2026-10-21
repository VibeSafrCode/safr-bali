# Installed backend preflight binding — 21 October 2026

Status: new offline source and27 synthetic subprocess tests accepted locally.
Not installed, not an actual production-settings import, not a deployment gate
PASS. Existing production_preflight.py remains byte-for-byte unchanged.

The new installed_preflight.py requires a root-owned read-only contract with
exact candidate root, nonroot effective UID/GID, directories, interpreter launch
path/resolved binary/prefix/symlink-chain pins and five exact source files.
It requires isolated Python and disabled bytecode writes, rejects inherited
PYTHONPATH/PYTHONHOME, cached app modules, local and external-prefix bytecode,
nonempty package initializers and old/shadow resolver paths.

Ordinary Python imports are used, with pre-resolution and post-import checks of
actual module origins, loaders, package paths and parent bindings. Source and
contract bytes/metadata are read before and after delegation; no source custom
loader fabricates the import proof. Existing preflight requires an explicitly
exported production profile before importing settings.

Only fixed success/refusal markers are emitted. Python streams plus direct
FD1/2 and existing logging-stream writes are discarded during the check and
restored afterward. This is output containment, not a hostile-code sandbox;
arbitrary children, deferred native output or malicious interpreter startup are
not certified. Trusted dependency closure remains a separate prerequisite.

Tests use explicit temporary synthetic settings, never the actual configuration.
They include source/interpreter/contract drift, symlinks/hardlinks, role/cwd,
duplicate keys, origin/package mutation, cached modules, stale matching-timestamp
local and external bytecode, shadow packages and output sentinels. The stale
bytecode negative first proves ordinary -I -B can read it, then proves refusal
before its sentinel under the binder. Local result27PASS/0SKIP.

The first Linux CI run rejected three positive harness cases: pytest's hosted
toolcache Python was unsuitable for the strict nonwritable interpreter policy.
The harness now explicitly inspects and uses system Python, compiles synthetic
bytecode with that same child version and exercises a writable-ancestor refusal.
Production policy is unchanged. Local27PASS/0SKIP includes cross-version parent
and child; a fresh exact-source Linux run remains required.

Before runtime use: include the new file in an exact installed candidate,
generate a separately reviewed root-owned contract from actual metadata, bind
the same interpreter/environment/UID/GID/cwd and source root as the real service
launch, and demonstrate the actual installed import under the effective sandbox.
No service unit, ownership, environment, ACL, database or running process was
changed by this source milestone. Backup/restore/lifecycle/single-poller and
combined rollback gates remain OPEN.
