import { manualStoresToPotentials, Potential, toPotential } from "./potentials";

/**
 * Where Potentials are kept. The app only goes through this, so the storage behind it can change (a shared sheet
 * later) without touching the screens.
 */
export interface PotentialRepository {
  list(): Potential[];
  add(p: Potential): void;
  update(p: Potential): void; // replaces the one with the same id
  remove(id: string): void;
}

/** The bits of localStorage used here, so tests can pass a stand-in. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const POTENTIALS_KEY = "dst.potentials";
export const OLD_MANUAL_STORES_KEY = "dst.manualStores";

// localStorage can be missing or throw (private browsing, blocked site data); then nothing is kept after the visit
function browserStorage(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readList(store: KeyValueStore | null): Potential[] {
  let raw: unknown = [];
  try {
    raw = JSON.parse(store?.getItem(POTENTIALS_KEY) || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const taken = new Set<string>();
  const list: Potential[] = [];
  for (const item of raw) {
    const p = toPotential(item, taken);
    if (!p || taken.has(p.id)) continue;
    taken.add(p.id);
    list.push(p);
  }
  return list;
}

function writeList(store: KeyValueStore | null, list: Potential[]) {
  try {
    if (list.length) store?.setItem(POTENTIALS_KEY, JSON.stringify(list));
    else store?.removeItem(POTENTIALS_KEY);
  } catch {
    // Not saved (storage full or blocked); the list still works until the page is closed
  }
}

/**
 * Moves the manual stores saved by earlier versions into the Potentials, under study, and deletes the old key.
 * Runs once: after it, the old key is gone. Returns how many were moved.
 */
export function migrateManualStores(store: KeyValueStore | null = browserStorage(), now = new Date()): number {
  let saved: string | null = null;
  try {
    saved = store?.getItem(OLD_MANUAL_STORES_KEY) ?? null;
  } catch {
    return 0;
  }
  if (saved === null) return 0;
  const list = readList(store);
  // If an earlier move couldn't delete the old key, the entries already moved aren't added twice
  const same = (a: Potential, b: Potential) => a.name === b.name && a.lat === b.lat && a.lng === b.lng;
  const moved = manualStoresToPotentials(saved, new Set(list.map((p) => p.id)), now).filter(
    (p) => !list.some((q) => same(p, q)),
  );
  writeList(store, [...list, ...moved]);
  try {
    store?.removeItem(OLD_MANUAL_STORES_KEY);
  } catch {
    // Left in place; the check above keeps the next attempt from adding copies
  }
  return moved.length;
}

/** Potentials kept in this browser's localStorage (dst.potentials). */
export function localPotentialRepository(store: KeyValueStore | null = browserStorage()): PotentialRepository {
  let cache: Potential[] | null = null;
  const all = () => (cache ??= readList(store));
  const save = (list: Potential[]) => {
    cache = list;
    writeList(store, list);
  };
  return {
    list: () => [...all()],
    add: (p) => save([...all().filter((x) => x.id !== p.id), p]),
    update: (p) => save(all().map((x) => (x.id === p.id ? p : x))),
    remove: (id) => save(all().filter((x) => x.id !== id)),
  };
}
