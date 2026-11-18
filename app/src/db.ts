export interface DocMeta { id: string; title: string; folderId: string | null; favorite: boolean; deletedAt: number | null; created: number; modified: number; openedAt: number; size: number; pages: number; boards: number; docs: number }
export interface Folder { id: string; name: string; parentId: string | null; created: number }
export interface Recovery { id: string; data: Uint8Array; savedAt: number }

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('fur-platform', 1);
    r.onupgradeneeded = () => { const d = r.result; for (const s of ['meta', 'blobs', 'folders', 'recovery']) d.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const wrap = <T>(q: IDBRequest<T>) => new Promise<T>((res, rej) => { q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
async function store(name: string, mode: IDBTransactionMode) { return (await open()).transaction(name, mode).objectStore(name); }
async function multi(names: string[], fn: (t: IDBTransaction) => void): Promise<void> {
  const t = (await open()).transaction(names, 'readwrite');
  await new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); fn(t); });
}
export const listMeta = async () => wrap<DocMeta[]>((await store('meta', 'readonly')).getAll());
export const getMeta = async (id: string) => wrap<DocMeta | undefined>((await store('meta', 'readonly')).get(id));
export const getBlob = async (id: string) => (await wrap<{ id: string; data: Uint8Array } | undefined>((await store('blobs', 'readonly')).get(id)))?.data;
export const putMeta = async (m: DocMeta) => { await wrap((await store('meta', 'readwrite')).put(m)); };
export const saveDoc = (m: DocMeta, data: Uint8Array) => multi(['meta', 'blobs'], t => { t.objectStore('meta').put(m); t.objectStore('blobs').put({ id: m.id, data }); });
export const deleteDoc = (id: string) => multi(['meta', 'blobs', 'recovery'], t => { t.objectStore('meta').delete(id); t.objectStore('blobs').delete(id); t.objectStore('recovery').delete(id); });
export const listFolders = async () => wrap<Folder[]>((await store('folders', 'readonly')).getAll());
export const putFolder = async (f: Folder) => { await wrap((await store('folders', 'readwrite')).put(f)); };
export const deleteFolder = async (id: string) => { await wrap((await store('folders', 'readwrite')).delete(id)); };
export const getRecovery = async (id: string) => wrap<Recovery | undefined>((await store('recovery', 'readonly')).get(id));
export const putRecovery = async (r: Recovery) => { await wrap((await store('recovery', 'readwrite')).put(r)); };
export const clearRecovery = async (id: string) => { await wrap((await store('recovery', 'readwrite')).delete(id)); };
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try { const e = await navigator.storage?.estimate(); return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null; } catch { return null; }
}
