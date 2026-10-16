import { useEffect, useState } from "react";
import { api } from "../api";

/** Recommended Java image tag for a Minecraft version. */
export function suggestImageTag(version, type) {
  const m = String(version || "").match(/^1\.(\d+)(?:\.(\d+))?/);
  if (!m) return "latest"; // LATEST or the new 26.x scheme
  const minor = parseInt(m[1], 10);
  const patch = parseInt(m[2] || "0", 10);
  if (minor <= 16) return type === "FORGE" || minor <= 12 ? "java8" : "java11";
  if (minor < 20 || (minor === 20 && patch <= 4)) return "java17";
  return "java21";
}

export const IMAGE_TAG_LABELS = {
  latest: "Última (Java más reciente)",
  stable: "Estable",
  java25: "Java 25",
  java21: "Java 21",
  java17: "Java 17",
  java11: "Java 11",
  java8: "Java 8",
};

export function useHost() {
  const [host, setHost] = useState(null);
  useEffect(() => {
    api.get("/api/host").then(setHost).catch(() => {});
  }, []);
  return host;
}

export function useMeta() {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    api.get("/api/meta").then(setMeta).catch(() => {});
  }, []);
  return meta;
}
