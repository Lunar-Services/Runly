const databaseName = "runly-pending-builds";
const storeName = "drafts";
const draftKey = "build";

export type PendingBuild = { prompt: string; files: File[] };

type PendingBuildRecord = PendingBuild & { id: string };

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePendingBuild(build: PendingBuild) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put({ ...build, id: draftKey });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

export async function getPendingBuild() {
  const database = await openDatabase();
  const build = await new Promise<PendingBuild | undefined>(
    (resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(draftKey);
      request.onsuccess = () => {
        const record = request.result as PendingBuildRecord | undefined;
        resolve(
          record ? { prompt: record.prompt, files: record.files } : undefined,
        );
      };
      request.onerror = () => reject(request.error);
    },
  );
  database.close();
  return build;
}

export async function clearPendingBuild() {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(draftKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}
