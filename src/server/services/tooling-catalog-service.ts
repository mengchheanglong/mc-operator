import path from "path";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import {
  getDirectiveForgeSourcePackCatalogPath,
  getDirectiveForgeSourcePacksRoot,
  getForgeSourcePackPath,
  listForgeSourcePackCatalogEntries,
} from "@/server/paths/directive-source-packs";

export interface ToolingCatalogEntry {
  key: string;
  label: string;
  path: string;
  exists: boolean;
  status: "ok" | "missing";
  note: string;
}

export interface ToolingCatalogSnapshot {
  toolingRoot: string;
  discoveredRoots: string[];
  catalogPath: string;
  entries: ToolingCatalogEntry[];
}

export async function getToolingCatalogSnapshot(): Promise<ToolingCatalogSnapshot> {
  const toolingRoot = getDirectiveForgeSourcePacksRoot();

  const discoveredRoots: string[] = [];
  try {
    const entries = await readdir(toolingRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      discoveredRoots.push(path.join(toolingRoot, entry.name));
    }
  } catch {}

  const entries: ToolingCatalogEntry[] = listForgeSourcePackCatalogEntries().map((entry) => {
    const packPath = getForgeSourcePackPath(entry.id);
    const exists = existsSync(packPath);
    const ready = existsSync(path.join(packPath, "SOURCE_PACK_READY.md"));
    return {
      key: entry.id,
      label: entry.label,
      path: packPath,
      exists,
      status: exists ? "ok" : "missing",
      note: `${entry.classification} · ${entry.activationMode} · ${ready ? "ready" : "not-ready"}`,
    };
  });

  return {
    toolingRoot,
    catalogPath: getDirectiveForgeSourcePackCatalogPath(),
    discoveredRoots: discoveredRoots.sort(),
    entries,
  };
}
