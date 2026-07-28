import { validatePublicEnvironment } from "../lib/public-env.mjs";

try {
  const values = validatePublicEnvironment({
    ...process.env,
    NODE_ENV: "production",
  });
  console.log(
    `Validated public production origins: ${values.siteUrl}, ${values.apiBaseUrl}`,
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? `Frontend production environment is invalid: ${error.message}`
      : "Frontend production environment is invalid",
  );
  process.exitCode = 1;
}
