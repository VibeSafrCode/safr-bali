const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const PRIVATE_PORTS = new Set(["8081"]);

export function validatePublicUrl(name, value, options = {}) {
  const { production = false, expectedHostname } = options;

  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must contain only an origin`);
  }

  if (production) {
    if (url.protocol !== "https:") {
      throw new Error(`${name} must use HTTPS in production`);
    }
    if (LOCAL_HOSTNAMES.has(url.hostname)) {
      throw new Error(`${name} must not use a local hostname in production`);
    }
    if (PRIVATE_PORTS.has(url.port)) {
      throw new Error(`${name} must not expose an internal port`);
    }
  }

  if (expectedHostname && url.hostname !== expectedHostname) {
    throw new Error(`${name} must use ${expectedHostname}`);
  }

  return url.origin;
}

export function validatePublicEnvironment(environment = process.env) {
  const production = environment.NODE_ENV === "production";
  return {
    siteUrl: validatePublicUrl(
      "NEXT_PUBLIC_SITE_URL",
      environment.NEXT_PUBLIC_SITE_URL,
      {
        production,
        expectedHostname: production ? "safrway.online" : undefined,
      },
    ),
    apiBaseUrl: validatePublicUrl(
      "NEXT_PUBLIC_API_BASE_URL",
      environment.NEXT_PUBLIC_API_BASE_URL,
      {
        production,
        expectedHostname: production ? "api.safrway.online" : undefined,
      },
    ),
  };
}
