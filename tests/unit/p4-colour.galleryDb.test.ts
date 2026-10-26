import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryGallery, openGallery } from '../../src/phases/phase4/gallery/galleryDb';

let n = 0;
const dbName = () => `nonla-test-${++n}`;
const png = (s: string) => new Blob([s], { type: 'image/png' });

describe('gallery DB', () => {
  afterEach(() => {
    // restore if a test removed it
    if (!('indexedDB' in globalThis)) (globalThis as { indexedDB?: IDBFactory }).indexedDB = saved;
  });
  const saved = globalThis.indexedDB;

  it('saves, lists newest first, gets, counts and deletes pictures', async () => {
    const g = await openGallery(dbName());
    expect(g.persistent).toBe(true);
    const a = await g.add({ pageId: 'plain', png: png('a'), thumb: png('ta'), lang: 'en', createdAt: 1000 });
    const b = await g.add({ pageId: 'market', png: png('b'), thumb: png('tb'), lang: 'vi', createdAt: 2000 });
    expect(a.id).not.toBe(b.id);
    expect(await g.count()).toBe(2);
    const list = await g.list();
    expect(list.map((x) => x.pageId)).toEqual(['market', 'plain']);
    const got = await g.get(a.id);
    expect(got?.pageId).toBe('plain');
    expect(got?.lang).toBe('en');
    expect(got?.png).toBeInstanceOf(Blob);
    expect(await got!.png.text()).toBe('a');
    await g.remove(a.id);
    expect(await g.count()).toBe(1);
    expect(await g.get(a.id)).toBeUndefined();
  });

  it('pictures survive reopening the database', async () => {
    const name = dbName();
    const g1 = await openGallery(name);
    await g1.add({ pageId: 'poem', png: png('p'), thumb: png('t'), lang: 'en' });
    const g2 = await openGallery(name);
    expect(await g2.count()).toBe(1);
  });

  it('stores one draft per page and restores it', async () => {
    const g = await openGallery(dbName());
    expect(await g.loadDraft('strap')).toBeUndefined();
    await g.saveDraft({ pageId: 'strap', updatedAt: 1, paint: png('v1'), src: 'page-2-strap.png' });
    await g.saveDraft({ pageId: 'strap', updatedAt: 2, paint: png('v2'), src: 'page-2-strap.png' });
    const d = await g.loadDraft('strap');
    expect(d?.updatedAt).toBe(2);
    expect(await d!.paint.text()).toBe('v2');
    expect(d?.src).toBe('page-2-strap.png');
    await g.deleteDraft('strap');
    expect(await g.loadDraft('strap')).toBeUndefined();
  });

  it('falls back to a session-only gallery without IndexedDB', async () => {
    delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    const g = await openGallery(dbName());
    expect(g.persistent).toBe(false);
    expect(g).toBeInstanceOf(MemoryGallery);
    await g.add({ pageId: 'plain', png: png('a'), thumb: png('t'), lang: 'en', createdAt: 5 });
    await g.add({ pageId: 'strap', png: png('b'), thumb: png('t'), lang: 'en', createdAt: 9 });
    expect((await g.list()).map((x) => x.pageId)).toEqual(['strap', 'plain']);
    await g.saveDraft({ pageId: 'plain', updatedAt: 1, paint: png('d'), src: 's' });
    expect((await g.loadDraft('plain'))?.src).toBe('s');
  });
});
