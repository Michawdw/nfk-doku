/* db.js – IndexedDB-Wrapper. Hält Projektkopf, Bilddoku-Struktur, eigene Namen,
   Bilder (append-only) und Bautagebuch-Tageseinträge persistent. */
const DB = (() => {
  const NAME = 'nfk-doku';
  const VERSION = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Einfache Key-Value-Stores für Einzelobjekte.
        if (!db.objectStoreNames.contains('project')) db.createObjectStore('project');
        if (!db.objectStoreNames.contains('structure')) db.createObjectStore('structure');
        if (!db.objectStoreNames.contains('customNames')) {
          db.createObjectStore('customNames', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('photos')) {
          const ps = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
          ps.createIndex('byNode', 'nodeKey', { unique: false });
        }
        if (!db.objectStoreNames.contains('diary')) {
          db.createObjectStore('diary', { keyPath: 'datum' });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }

  function reqP(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ---- Projektkopf (key 'current') ----
  async function getProject() {
    const s = await tx('project', 'readonly');
    return reqP(s.get('current'));
  }
  async function saveProject(obj) {
    const s = await tx('project', 'readwrite');
    return reqP(s.put(obj, 'current'));
  }

  // ---- Importierte Struktur (key 'current'): Array von Knoten ----
  async function getStructure() {
    const s = await tx('structure', 'readonly');
    return (await reqP(s.get('current'))) || [];
  }
  async function saveStructure(arr) {
    const s = await tx('structure', 'readwrite');
    return reqP(s.put(arr, 'current'));
  }

  // ---- Eigene Namen (bleiben bei Re-Import erhalten) ----
  async function getCustomNames() {
    const s = await tx('customNames', 'readonly');
    return reqP(s.getAll());
  }
  async function addCustomName(node) {
    const s = await tx('customNames', 'readwrite');
    return reqP(s.put(node));
  }

  // ---- Bilder (append-only) ----
  async function countPhotos(nodeKey) {
    const s = await tx('photos', 'readonly');
    return reqP(s.index('byNode').count(IDBKeyRange.only(nodeKey)));
  }
  async function getPhotos(nodeKey) {
    const s = await tx('photos', 'readonly');
    const all = await reqP(s.index('byNode').getAll(IDBKeyRange.only(nodeKey)));
    return all.sort((a, b) => a.seq - b.seq);
  }
  async function getAllPhotos() {
    const s = await tx('photos', 'readonly');
    return reqP(s.getAll());
  }
  async function addPhoto(rec) {
    // rec: { nodeKey, seq, blob, createdAt }. Niemals update/delete.
    const s = await tx('photos', 'readwrite');
    return reqP(s.add(rec));
  }

  // ---- Bautagebuch-Tage ----
  async function getDiary(datum) {
    const s = await tx('diary', 'readonly');
    return reqP(s.get(datum));
  }
  async function saveDiary(obj) {
    const s = await tx('diary', 'readwrite');
    return reqP(s.put(obj));
  }

  return {
    getProject, saveProject,
    getStructure, saveStructure,
    getCustomNames, addCustomName,
    countPhotos, getPhotos, getAllPhotos, addPhoto,
    getDiary, saveDiary,
  };
})();
