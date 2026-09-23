export type ServicePresence = "all" | "with" | "without";

export function readServicePresence(params: URLSearchParams): ServicePresence {
  if (params.get("has_services") === "true") return "with";
  return params.get("has_services") === "false" || params.get("no_services") === "true" ? "without" : "all";
}

export function setServicePresence(params: URLSearchParams, value: ServicePresence): URLSearchParams {
  params.delete("has_services");
  params.delete("no_services");
  if (value === "with") params.set("has_services", "true");
  if (value === "without") params.set("no_services", "true");
  return params;
}
