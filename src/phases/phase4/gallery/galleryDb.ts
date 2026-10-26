/**
 * "Tranh của con": the child's saved pictures and the colouring drafts, in IndexedDB
 * (database 'nonla', stores 'gallery' and 'drafts'; tests/unit/p4-colour.galleryDb.test.ts).
 * Where IndexedDB is missing or refuses to open (some private modes), the same API keeps the
 * pictures in memory for this visit only; `persistent` tells the UI to say so and offer downloads.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface Artwork {
  id: string;
  pageId: string;
  createdAt: number;
  png: Blob;
  thumb: Blob;
  lang: string;
}

export interface Draft {
  pageId: string;
  updatedAt: number;
  /** PNG of the paint layer only */
  paint: Blob;
  /** the line-art URL it was painted over (a replaced page invalidates old drafts) */
  src: string;
}

export interface GalleryStore {
  readonly persistent: boolean;
  add(art: Omit<Artwork, 'id' | 'createdAt'> & Partial<Pick<Artwork, 'id' | 'createdAt'>>): Promise<Artwork>;
  /** newest first */
  list(): Promise<Artwork[]>;
  get(id: string): Promise<Artwork | undefined>;
  remove(id: string): Promise<void>;
  count(): Promise<number>;
  saveDraft(d: Draft): Promise<void>;
  loadDraft(pageId: string): Promise<Draft | undefined>;
  deleteDraft(pageId: string): Promise<void>;
}

interface NonlaDB extends DBSchema {
  gallery: { key: string; value: Artwork; indexes: { createdAt: number } };
  drafts: { key: string; value: Draft };
}

export const DB_NAME = 'nonla';
const DB_VERSION = 1;
const OPEN_TIMEOUT_MS = 4000;

export function newId(now = Date.now()): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

class IdbGallery implements GalleryStore {
  readonly persistent = true;
  constructor(private db: IDBPDatabase<NonlaDB>) {}

  async add(art: Omit<Artwork, 'id' | 'createdAt'> & Partial<Pick<Artwork, 'id' | 'createdAt'>>): Promise<Artwork> {
    const createdAt = art.createdAt ?? Date.now();
    const rec: Artwork = { ...art, id: art.id ?? newId(createdAt), createdAt };
    await this.db.put('gallery', rec);
    return rec;
  }

  async list(): Promise<Artwork[]> {
    const all = await this.db.getAllFromIndex('gallery', 'createdAt');
    return all.reverse();
  }

  get(id: string): Promise<Artwork | undefined> {
    return this.db.get('gallery', id);
  }

  remove(id: string): Promise<void> {
    return this.db.delete('gallery', id);
  }

  count(): Promise<number> {
    return this.db.count('gallery');
  }

  async saveDraft(d: Draft): Promise<void> {
    await this.db.put('drafts', d);
  }

  loadDraft(pageId: string): Promise<Draft | undefined> {
    return this.db.get('drafts', pageId);
  }

  deleteDraft(pageId: string): Promise<void> {
    return this.db.delete('drafts', pageId);
  }
}

/** session-only: survives screen changes, not a reload */
export class MemoryGallery implements GalleryStore {
  readonly persistent = false;
  private arts = new Map<string, Artwork>();
  private drafts = new Map<string, Draft>();

  async add(art: Omit<Artwork, 'id' | 'createdAt'> & Partial<Pick<Artwork, 'id' | 'createdAt'>>): Promise<Artwork> {
    const createdAt = art.createdAt ?? Date.now();
    const rec: Artwork = { ...art, id: art.id ?? newId(createdAt), createdAt };
    this.arts.set(rec.id, rec);
    return rec;
  }

  async list(): Promise<Artwork[]> {
    return [...this.arts.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<Artwork | undefined> {
    return this.arts.get(id);
  }

  async remove(id: string): Promise<void> {
    this.arts.delete(id);
  }

  async count(): Promise<number> {
    return this.arts.size;
  }

  async saveDraft(d: Draft): Promise<void> {
    this.drafts.set(d.pageId, d);
  }

  async loadDraft(pageId: string): Promise<Draft | undefined> {
    return this.drafts.get(pageId);
  }

  async deleteDraft(pageId: string): Promise<void> {
    this.drafts.delete(pageId);
  }
}

export async function openGallery(name = DB_NAME): Promise<GalleryStore> {
  try {
    if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('no IndexedDB');
    const db = await withTimeout(
      openDB<NonlaDB>(name, DB_VERSION, {
        upgrade(d) {
          if (!d.objectStoreNames.contains('gallery')) d.createObjectStore('gallery', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
          if (!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts', { keyPath: 'pageId' });
        },
      }),
      OPEN_TIMEOUT_MS,
    );
    // a probe write: some private modes open fine and then refuse every transaction
    await db.count('gallery');
    return new IdbGallery(db);
  } catch {
    return new MemoryGallery();
  }
}

let shared: Promise<GalleryStore> | null = null;

/** the one store for this visit (the studio and the gallery screen share it) */
export function getGallery(): Promise<GalleryStore> {
  if (!shared) {
    shared = openGallery();
    // ask the browser not to evict the child's pictures; harmless if refused
    void shared.then((s) => {
      if (s.persistent) void navigator.storage?.persist?.().catch(() => false);
    });
  }
  return shared;
}

/** tests only */
export function resetSharedGallery(): void {
  shared = null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
