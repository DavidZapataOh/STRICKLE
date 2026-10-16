import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { wrappedSecretStore } from "../src/keys/secret-store.ts";

describe("wrappedSecretStore", () => {
  it("returns what was set, replaces it on a second set and forgets on remove", async () => {
    await wrappedSecretStore.set("a", "first");
    expect(await wrappedSecretStore.get("a")).toBe("first");
    await wrappedSecretStore.set("a", "second");
    expect(await wrappedSecretStore.get("a")).toBe("second");
    await wrappedSecretStore.remove("a");
    expect(await wrappedSecretStore.get("a")).toBeNull();
  });

  it("keeps names apart and reports null for a name that was never set", async () => {
    await wrappedSecretStore.set("x", "1");
    await wrappedSecretStore.set("y", "2");
    expect(await wrappedSecretStore.get("x")).toBe("1");
    expect(await wrappedSecretStore.get("y")).toBe("2");
    expect(await wrappedSecretStore.get("never")).toBeNull();
  });

  it("will not open a record that was copied under another name", async () => {
    await wrappedSecretStore.set("from", "secret");
    const request = <T,>(work: IDBRequest<T>) => new Promise<T>((resolve, reject) => Object.assign(work, { onsuccess: () => resolve(work.result), onerror: () => reject(work.error) }));
    const db = await request(indexedDB.open("strickle-keys", 1));
    const stored = await request(db.transaction("secrets").objectStore("secrets").get("from"));
    await request(db.transaction("secrets", "readwrite").objectStore("secrets").put(stored, "to"));
    db.close();
    expect(await wrappedSecretStore.get("to")).toBeNull();
  });

  it("repairs a database that exists without its store", async () => {
    await new Promise<void>((resolve, reject) => {
      const wipe = indexedDB.deleteDatabase("strickle-keys");
      wipe.onsuccess = () => resolve();
      wipe.onerror = () => reject(wipe.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("strickle-keys", 1);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    await wrappedSecretStore.set("repair", "value");
    expect(await wrappedSecretStore.get("repair")).toBe("value");
  });
});
