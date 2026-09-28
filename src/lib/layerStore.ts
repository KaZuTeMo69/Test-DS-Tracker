import { ZoneLayer } from "../types";
import { toLayer } from "./layers";

// Map layers are kept in the browser's database (IndexedDB) rather than localStorage, which is too small for
// large KML files. Like everything else, they stay in this browser.
const DB_NAME = "dark-store-tracker";
const STORE = "layers";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB isn't available"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Couldn't open IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB is blocked"));
  }).catch((err) => {
    dbPromise = null; // try again next time
    throw err;
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? request.error);
    tx.onabort = () => reject(tx.error ?? new Error("Saving was cancelled"));
  });
}

/** The saved layers, oldest first. Entries that can't be read are skipped and counted. */
export async function loadLayers(): Promise<{ layers: ZoneLayer[]; skipped: number }> {
  const raw = await run("readonly", (store) => store.getAll());
  const layers = raw.map(toLayer).filter((l): l is ZoneLayer => l !== null);
  layers.sort((a, b) => a.created - b.created);
  return { layers, skipped: raw.length - layers.length };
}

export const saveLayer = (layer: ZoneLayer) => run("readwrite", (store) => store.put(layer)).then(() => undefined);

export const deleteLayer = (id: string) => run("readwrite", (store) => store.delete(id)).then(() => undefined);

export const clearLayers = () => run("readwrite", (store) => store.clear()).then(() => undefined);
