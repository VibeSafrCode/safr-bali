/** Shared UI-object provenance only, never actor/session/role ACL. No dataset import. */
import type {ClientUiBindings} from "./client-ui-bindings";
const instances = new WeakSet<object>();
/** Internal construction seam; the canonical factory owns locale/text validation. */
export function registerClientUiBinding(binding:ClientUiBindings){instances.add(binding);}
export function requireClientUiBindings(value: unknown): ClientUiBindings {
  if (!value || typeof value !== "object" || !instances.has(value)) {
    throw new Error("CLIENT_UI_BINDING_ROLE_OR_PROVENANCE");
  }
  return value as ClientUiBindings;
}
