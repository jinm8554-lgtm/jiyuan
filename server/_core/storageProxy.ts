import type { Express } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ENV } from "./env";

const LOCAL_STORAGE_ROOT = path.resolve(process.env.LOCAL_STORAGE_DIR ?? path.join(process.cwd(), ".local-storage"));

function localStoragePath(key: string) {
  const resolved = path.resolve(LOCAL_STORAGE_ROOT, ...key.replaceAll("\\", "/").replace(/^local\//, "").split("/"));
  const root = `${LOCAL_STORAGE_ROOT}${path.sep}`;
  if (resolved !== LOCAL_STORAGE_ROOT && !resolved.startsWith(root)) throw new Error("Invalid local storage path");
  return resolved;
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (key.startsWith("local/") && !ENV.forgeApiUrl && !ENV.forgeApiKey) {
      try {
        const body = await readFile(localStoragePath(key));
        res.set("Cache-Control", "no-store");
        res.type(path.extname(key) || "application/octet-stream").send(body);
      } catch {
        res.status(404).send("Local storage object not found");
      }
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
