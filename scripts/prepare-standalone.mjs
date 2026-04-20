import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneRoot = path.join(root, ".next", "standalone");
const standaloneNextRoot = path.join(standaloneRoot, ".next");

function copyRecursive(source, destination) {
  if (!fs.existsSync(source)) {
    return false;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
  return true;
}

if (!fs.existsSync(standaloneRoot)) {
  console.error("Standalone build output is missing. Run Next build before preparing standalone assets.");
  process.exit(1);
}

copyRecursive(path.join(root, ".next", "static"), path.join(standaloneNextRoot, "static"));
copyRecursive(path.join(root, "public"), path.join(standaloneRoot, "public"));

console.log("Standalone assets prepared.");
