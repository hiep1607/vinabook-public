import { ReaderTextures } from './reader-textures';
import { ReaderBook } from './reader-model';
import * as THREE from 'three';
describe('ReaderTextures resource lifetime', () => {
  const book: ReaderBook = {
    productId: 1, title: 'Fixture', author: '', cover: '', hardcover: false, width: 2.16, height: 3.05,
    pages: Array.from({ length: 100 }, (_, i) => ({ id: String(i), kind: 'image' as const, url: '/' + i + '.png' }))
  };
  it('limits the window, aborts old loads and disposes late arrivals', async () => {
    const pool = new ReaderTextures(book, () => undefined);
    const requests: Array<{signal:AbortSignal; resolve:(t:THREE.Texture)=>void}> = [];
    spyOn(pool, 'image').and.callFake((_url, signal) => new Promise(resolve => requests.push({signal, resolve})));
    pool.window(Array.from({length:20}, (_,i) => i));
    expect(requests.length).toBe(8);
    pool.window([40,41,42,43,44,45,46,47]);
    expect(requests.slice(0,8).every(r => r.signal.aborted)).toBeTrue();
    const textures = requests.map(() => new THREE.Texture());
    const spies = textures.map(t => spyOn(t,'dispose'));
    requests.forEach((r,i) => r.resolve(textures[i]));
    await pool.ready([40,41,42,43,44,45,46,47]);
    expect(spies.slice(0,8).every(s => s.calls.count() === 1)).toBeTrue();
    pool.dispose();
    expect(spies.every(s => s.calls.count() === 1)).toBeTrue();
  });
  it('discards a result arriving after the dialog was destroyed', async () => {
    const changed = jasmine.createSpy('changed'), pool = new ReaderTextures(book, changed);
    let complete!: (t:THREE.Texture)=>void;
    spyOn(pool,'image').and.callFake(() => new Promise(resolve => complete=resolve));
    pool.window([0]); const pending = pool.ready([0]); pool.dispose();
    const texture = new THREE.Texture(), dispose = spyOn(texture,'dispose'); complete(texture);
    await pending; expect(dispose).toHaveBeenCalledTimes(1); expect(changed).not.toHaveBeenCalled();
  });
});
