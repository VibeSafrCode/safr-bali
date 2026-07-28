const RETURN_PATH_PATTERN = /^\/account\/[a-zA-Z0-9/_-]*$/;

export function safeAccountReturnPath(value) {
  if (typeof value !== "string" || value.length === 0) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (
    !RETURN_PATH_PATTERN.test(decoded) ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    decoded.includes("..") ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    return null;
  }
  return decoded;
}

export function buildAccountRedirect(
  incomingUrl,
  contract,
  { environment = "preview" } = {},
) {
  const incoming = new URL(incomingUrl);
  const location = new URL(contract.target);
  const returnPath = safeAccountReturnPath(
    incoming.searchParams.get("return_to"),
  );

  if (returnPath) {
    location.searchParams.set("return_to", returnPath);
  }

  const permanent =
    environment === "production" && contract.productionStatusEnabled === true;
  return {
    status: permanent ? contract.productionStatus : contract.previewStatus,
    location: location.toString(),
  };
}
