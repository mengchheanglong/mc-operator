import { execSync } from "node:child_process";
import path from "node:path";

const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");

execSync("npm run check:frontend-host", {
  cwd: directiveRoot,
  stdio: "inherit",
});
