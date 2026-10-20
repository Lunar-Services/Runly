"use client";

import { useEffect, useSyncExternalStore } from "react";
import { z } from "zod";
import { getCountry } from "@/lib/countries";

export const isInfrastructureMock = false;
export const defaultSwiftlet: SwiftletSettings = {
  endpoint: "",
  scheduling: "least-occupied",
  maxEggs: 8,
  idleMinutes: 30,
  heartbeatSeconds: 90,
  provisioningSeconds: 180,
};

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
  maxEggs: z.number().int().min(1).max(500),
  idleMinutes: z.number().int().min(1).max(1440),
  heartbeatSeconds: z.number().int().min(10).max(600),
  provisioningSeconds: z.number().int().min(30).max(3600),
});

export type SwiftletSettings = z.infer<typeof swiftletSchema>;

export const nestSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    endpoint: serviceUrl,
    countryCode: z
      .string()
      .refine(
        (code) => !code || Boolean(getCountry(code)),
        "Choose a country from the list.",
      )
      .default(""),
    maxEggs: z.number().int().min(1).max(500),
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

type Store = {
  swiftlet: SwiftletSettings;
  nests: Nest[];
  loading: boolean;
  loaded: boolean;
  error: string;
  tokenConfigured: boolean;
};
const initialStore: Store = {
  swiftlet: defaultSwiftlet,
  nests: [],
  loading: false,
  loaded: false,
  error: "",
  tokenConfigured: false,
};
let store = initialStore;
let loadRequest: Promise<void> | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function publish(value: Partial<Store>) {
  store = { ...store, ...value };
  for (const listener of listeners) listener();
}
const snapshot = () => store;
const serverSnapshot = () => initialStore;

async function api<T>(resource: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/admin/${resource}`, {
    ...init,
    cache: "no-store",
    headers,
  });
  const result = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | null;
  if (!response.ok)
    throw new Error(result?.message || "Couldn't save the changes.");
  return result as T;
}

async function load() {
  if (store.loaded || loadRequest) return loadRequest;
  publish({ loading: true, error: "" });
  loadRequest = Promise.all([
    api<{ settings: SwiftletSettings; tokenConfigured: boolean }>("swiftlet"),
    api<{ nests: Nest[] }>("nests"),
  ])
    .then(([swiftlet, nests]) => {
      const parsedSwiftlet = swiftletSchema.safeParse(swiftlet.settings);
      const parsedNests = z.array(nestSchema).max(1000).safeParse(nests.nests);
      if (!parsedSwiftlet.success || !parsedNests.success)
        throw new Error("The saved infrastructure configuration is invalid.");
      publish({
        swiftlet: parsedSwiftlet.data,
        nests: parsedNests.data,
        tokenConfigured: swiftlet.tokenConfigured,
        loaded: true,
        loading: false,
      });
    })
    .catch((error: unknown) => {
      publish({
        loaded: true,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Couldn't load infrastructure settings.",
      });
    })
    .finally(() => {
      loadRequest = null;
    });
  return loadRequest;
}

function useStore() {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    void load();
  }, []);
  return value;
}

export function retryInfrastructureLoad() {
  publish({ loaded: false, loading: false, error: "" });
  return load();
}

export function useSwiftletSettings() {
  return useStore().swiftlet;
}
export function useNests() {
  return useStore().nests;
}
export function useInfrastructureStatus() {
  const { loading, loaded, error, tokenConfigured } = useStore();
  return { loading, loaded, error, tokenConfigured };
}

export async function saveSwiftletSettings(
  settings: SwiftletSettings,
  apiToken?: string | null,
) {
  const result = await api<{
    settings: SwiftletSettings;
    tokenConfigured: boolean;
  }>("swiftlet", {
    method: "PUT",
    body: JSON.stringify({
      ...settings,
      ...(apiToken === undefined ? {} : { apiToken: apiToken || null }),
    }),
  });
  const parsed = swiftletSchema.parse(result.settings);
  publish({
    swiftlet: parsed,
    tokenConfigured: result.tokenConfigured,
    loaded: true,
  });
}

export async function saveNest(nest: Nest, isNew: boolean) {
  const result = await api<{ nest: Nest }>("nests", {
    method: isNew ? "POST" : "PUT",
    body: JSON.stringify({
      ...(isNew ? {} : { id: nest.id }),
      name: nest.name,
      endpoint: nest.endpoint,
      countryCode: nest.countryCode,
      maxEggs: nest.maxEggs,
      ...(nest.status === "online" ? {} : { status: nest.status }),
    }),
  });
  const saved = nestSchema.parse(result.nest);
  publish({
    nests: isNew
      ? [...store.nests, saved]
      : store.nests.map((item) => (item.id === saved.id ? saved : item)),
    loaded: true,
  });
  return saved;
}

export async function removeNest(id: string) {
  await api<{ message: string }>("nests", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
  publish({ nests: store.nests.filter((nest) => nest.id !== id) });
}
