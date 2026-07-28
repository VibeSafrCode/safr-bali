import { spawn } from "node:child_process";
import path from "node:path";

const cli = path.resolve("node_modules/@lhci/cli/src/cli.js");
const chromePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const child = spawn(
  process.execPath,
  [cli, "autorun", "--config=./lighthouserc.cjs"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CHROME_PATH: chromePath,
    },
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Lighthouse CI terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
