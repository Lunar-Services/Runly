"use client";

import { useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import { getCountry, legacyCountryCode } from "@/lib/countries";

export const isInfrastructureMock = process.env.NODE_ENV === "development";
export const swiftletSettingsKey = "runly-admin-dev-swiftlet:v2";
export const nestsKey = "runly-admin-dev-nests:v2";
const eventName = "runly-admin-infrastructure";

export const serviceUrl = z
  .string()
  .trim()
  .max(2048)
  .url("Enter a complete URL, including https://.")
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "Use an HTTP or HTTPS base URL without credentials, a query, or a fragment.")
  .transform((value) => new URL(value).toString().replace(/\/+$/, ""));
export const swiftletSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (value) => !value || serviceUrl.safeParse(value).success,
      "Enter an HTTP or HTTPS base URL without credentials, a query, or a fragment.",
    )
    .transform((value) => (value ? serviceUrl.parse(value) : "")),
  scheduling: z.enum(["least-occupied", "round-robin", "available-memory"]),
  maxEggs: z
    .number()
    .int()
    .min(1, "Use at least 1 Egg.")
    .max(500, "Use 500 Eggs or fewer."),
  idleMinutes: z
    .number()
    .int()
    .min(1, "Use at least 1 minute.")
    .max(1440, "Use 1,440 minutes or fewer."),
  heartbeatSeconds: z
    .number()
    .int()
    .min(10, "Use at least 10 seconds.")
    .max(600, "Use 600 seconds or fewer."),
  provisioningSeconds: z
    .number()
    .int()
    .min(30, "Use at least 30 seconds.")
    .max(3600, "Use 3,600 seconds or fewer."),
});
export type SwiftletSettings = z.infer<typeof swiftletSchema>;
export const defaultSwiftlet: SwiftletSettings = {
  endpoint: "",
  scheduling: "least-occupied",
  maxEggs: 8,
  idleMinutes: 30,
  heartbeatSeconds: 90,
  provisioningSeconds: 180,
};
export const nestSchema = z
  .object({
    id: z.string().uuid(),
    name: z
      .string()
      .trim()
      .min(1, "Enter a name for this Nest.")
      .max(80, "Use 80 characters or fewer."),
    endpoint: serviceUrl,
    countryCode: z
      .string()
      .refine(
        (code) => !code || Boolean(getCountry(code)),
        "Choose a country from the list.",
      )
      .default(""),
    maxEggs: z
      .number()
      .int()
      .min(1, "Use at least 1 Egg.")
      .max(500, "Use 500 Eggs or fewer."),
    status: z
      .enum(["online", "draining", "offline", "pending"])
      .default("pending"),
    activeEggs: z.number().int().min(0).max(500).nullable().default(null),
    cpuPercent: z.number().min(0).max(100).nullable().default(null),
    ramPercent: z.number().min(0).max(100).nullable().default(null),
  })
  .refine(
    (nest) => nest.activeEggs === null || nest.maxEggs >= nest.activeEggs,
    {
      path: ["maxEggs"],
      message: "Capacity cannot be lower than the number of active Eggs.",
    },
  );
export type Nest = z.infer<typeof nestSchema>;

const mockSwiftlet: SwiftletSettings = {
  ...defaultSwiftlet,
  endpoint: "https://swiftlet.dev.runly.test",
  maxEggs: 16,
};
const mockNests: Nest[] = [
  {
    id: "4c743e23-9cc2-4c38-8f4f-36be2dd73201",
    name: "singapore-01",
    endpoint: "https://sg-01.nests.runly.test:9443",
    countryCode: "SG",
    activeEggs: 7,
    cpuPercent: 36,
    ramPercent: 44,
    maxEggs: 16,
    status: "online",
  },
  {
    id: "4c743e23-9cc2-4c38-8f4f-36be2dd73202",
    name: "singapore-02",
    endpoint: "https://sg-02.nests.runly.test:9443",
    countryCode: "SG",
    activeEggs: 12,
    cpuPercent: 72,
    ramPercent: 81,
    maxEggs: 16,
    status: "online",
  },
  {
    id: "4c743e23-9cc2-4c38-8f4f-36be2dd73203",
    name: "frankfurt-01",
    endpoint: "https://fra-01.nests.runly.test:9443",
    countryCode: "DE",
    activeEggs: 4,
    cpuPercent: 18,
    ramPercent: 27,
    maxEggs: 24,
    status: "draining",
  },
  {
    id: "4c743e23-9cc2-4c38-8f4f-36be2dd73204",
    name: "virginia-01",
    endpoint: "https://iad-01.nests.runly.test:9443",
    countryCode: "US",
    activeEggs: 22,
    cpuPercent: 64,
    ramPercent: 68,
    maxEggs: 32,
    status: "online",
  },
  {
    id: "4c743e23-9cc2-4c38-8f4f-36be2dd73205",
    name: "sydney-01",
    endpoint: "https://syd-01.nests.runly.test:9443",
    countryCode: "AU",
    activeEggs: null,
    cpuPercent: null,
    ramPercent: null,
    maxEggs: 8,
    status: "offline",
  },
];

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(eventName, callback);
  };
}
function useStoredConfiguration<T>(
  key: string,
  fallback: T,
  parse: (value: unknown) => T,
) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      if (!isInfrastructureMock) return "";
      try {
        return localStorage.getItem(key) || "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  return useMemo(() => {
    if (!snapshot) return fallback;
    try {
      return parse(JSON.parse(snapshot));
    } catch {
      return fallback;
    }
  }, [snapshot, fallback, parse]);
}
const emptyNests: Nest[] = [];
const initialSwiftlet = isInfrastructureMock ? mockSwiftlet : defaultSwiftlet;
const initialNests = isInfrastructureMock ? mockNests : emptyNests;
function parseSwiftlet(value: unknown) {
  const result = swiftletSchema.safeParse(value);
  return result.success ? result.data : initialSwiftlet;
}
function parseNests(value: unknown) {
  // Preserve existing development configurations when upgrading the list UI.
  const migrated = Array.isArray(value)
    ? value.map((record) => {
        if (!record || typeof record !== "object") return record;
        const existing = record as Record<string, unknown>;
        const mock = isInfrastructureMock
          ? mockNests.find((nest) => nest.id === existing.id)
          : undefined;
        return {
          ...(mock || {}),
          ...existing,
          ...(existing.activeEggs === undefined &&
          mock?.activeEggs != null &&
          typeof existing.maxEggs === "number"
            ? { activeEggs: Math.min(mock.activeEggs, existing.maxEggs) }
            : {}),
          countryCode:
            existing.countryCode ??
            (typeof existing.region === "string"
              ? legacyCountryCode(existing.region)
              : mock?.countryCode || ""),
        };
      })
    : value;
  const result = z.array(nestSchema).max(250).safeParse(migrated);
  return result.success ? result.data : initialNests;
}
export function useSwiftletSettings() {
  return useStoredConfiguration(
    swiftletSettingsKey,
    initialSwiftlet,
    parseSwiftlet,
  );
}
export function useNests() {
  return useStoredConfiguration(nestsKey, initialNests, parseNests);
}
export function saveConfiguration(
  key: string,
  value: SwiftletSettings | Nest[],
) {
  if (!isInfrastructureMock)
    throw new Error("Swiftlet service is not configured.");
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(eventName));
}
