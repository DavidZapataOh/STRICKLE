export interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

const DB = "strickle-keys";
const STORE = "secrets";

interface Stored {
  iv: Uint8Array<ArrayBuffer>;
  wrapped: ArrayBuffer;
  wrapKey: CryptoKey;
}

const utf8 = (value: string) => new TextEncoder().encode(value);

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Named secrets wrapped with a non-extractable AES-GCM key kept next to them; the name is the associated data. At rest only the wrapped value
 * exists. This stops a script from copying a raw secret out of storage; it does not stop script running in the page from using it, which is
 * what the page's Content Security Policy is for.
 */
export const wrappedSecretStore: SecretStore = {
  async set(name, value) {
    const wrapKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(name) }, wrapKey, utf8(value));
    await run("readwrite", (store) => store.put({ iv, wrapped, wrapKey } satisfies Stored, name));
  },
  async get(name) {
    const stored = (await run("readonly", (store) => store.get(name))) as Stored | undefined;
    if (!stored) return null;
    try {
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: stored.iv, additionalData: utf8(name) }, stored.wrapKey, stored.wrapped));
    } catch {
      return null;
    }
  },
  async remove(name) {
    await run("readwrite", (store) => store.delete(name));
  },
};
