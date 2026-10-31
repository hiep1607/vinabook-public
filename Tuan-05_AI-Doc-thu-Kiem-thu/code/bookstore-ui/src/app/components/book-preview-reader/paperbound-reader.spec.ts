import { maxTurns, releaseTarget, sheetCurve, spread } from './paperbound-math';
import { ReaderController } from './reader-controller';
import { adaptPreview } from './reader-model';
import { PaperboundLeaf } from './paperbound-leaf';
import * as THREE from 'three';

describe('Paperbound reader invariants', () => {
  it('adapts text typography without replacing authorized content', () => {
    const text = '<script>Không thực thi</script>\nTiếng Việt: ă â ê ô ơ ư đ';
    const book = adaptPreview({id:1,name:'Sách'}, {productId:1,enabled:true,pageCount:1,pages:[
      {pageOrder:1,imageUrl:'',contentType:'text',textContent:text,fontFamily:'sans',fontSize:22,textAlign:'center'}
    ]});
    expect(book.pages[0].kind).toBe('text');
    if (book.pages[0].kind === 'text') {
      expect(book.pages[0].text).toBe(text); expect(book.pages[0].fontSize).toBe(22);
    }
  });
  it('preserves the length of every strip across both directions and corner bends', () => {
    [0, .1, .34, .5, .66, .9, 1].forEach(p => [-1, 0, 1].forEach(corner => {
      const points = sheetCurve(p, 2.16, 48, corner);
      for (let i = 1; i < points.length; i++) {
        expect(Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])).toBeCloseTo(2.16 / 48, 10);
      }
    }));
  });
  [0, 1, 5, 6, 101, 100].forEach(count => {
    it('visits each authorized page exactly once with ' + count + ' pages and excludes padding', () => {
      const seen: number[] = [];
      for (let t = 0; t <= maxTurns(count); t++) {
        const pair = spread(t, count); [pair.left, pair.right].forEach(i => { if (i >= 0) { seen.push(i); } });
      }
      expect(seen).toEqual(Array.from({length: count}, (_, i) => i));
    });
  });
  it('returns incomplete/cancelled drags and commits a fast flick in either direction', () => {
    expect(releaseTarget(.2, 1, 0, true)).toBe(0);
    expect(releaseTarget(.2, 1, -.8, true)).toBe(1);
    expect(releaseTarget(.8, -1, .8, true)).toBe(0);
    expect(releaseTarget(.8, 1, -.8, false)).toBe(0);
    expect(releaseTarget(.2, -1, .8, false)).toBe(1);
  });
  it('serializes buttons, drag, cover close and disposal', () => {
    const c = new ReaderController(100, false, () => undefined);
    c.open(); c.tick(performance.now() + 1000);
    expect(c.begin(1)).toBeTrue(); expect(c.begin(1)).toBeFalse();
    c.close(); expect(c.state).toBe('settling');
    c.settle(); c.tick(performance.now() + 2000);
    expect(c.turned).toBe(1);
    expect(c.begin(-1, true)).toBeTrue();
    c.drag(.3); c.release(0, false); c.tick(performance.now() + 2000);
    expect(c.turned).toBe(1);
    c.turned = 40; c.close();
    c.tick(performance.now() + 1000); c.tick(performance.now() + 2000);
    expect(c.state).toBe('closed'); expect(c.turned).toBe(0);
    c.open(); c.dispose(); c.tick(performance.now() + 5000); expect(c.state).toBe('disposed');
  });
  it('keeps back UVs readable and separates both faces at the upright position', () => {
    const blank = new THREE.Texture(), leaf = new PaperboundLeaf(2.16, 3.05, blank);
    leaf.update(.5, .2);
    const pos = leaf.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const uv = leaf.mesh.geometry.attributes.uv as THREE.BufferAttribute;
    const count = pos.count / 2;
    for (let n = 0; n < count; n++) {
      expect(uv.getX(n) + uv.getX(n + count)).toBeCloseTo(1, 6);
      expect(Math.hypot(pos.getX(n) - pos.getX(n + count), pos.getY(n) - pos.getY(n + count))).toBeCloseTo(.003, 5);
    }
    leaf.mesh.geometry.dispose(); leaf.mesh.material.forEach(m => m.dispose()); blank.dispose();
  });
  it('uses only enabled pages of the matching product and keeps total pages separate', () => {
    const product = { id: 10, name: 'Sách thật', pageCount: 300 };
    const manifest = { productId: 10, enabled: true, pageCount: 2, pages: [
      { pageOrder: 2, originalPageNumber: 22, imageUrl: '/2.png' },
      { pageOrder: 1, imageUrl: '/1.png', enabled: false }
    ] };
    const book = adaptPreview(product, manifest);
    expect(book.totalPages).toBe(300); expect(book.pages.length).toBe(1);
    expect(book.pages[0].printedNumber).toBe(22);
    expect(adaptPreview(product, {...manifest, enabled:false}).pages).toEqual([]);
    expect(adaptPreview({...product, id:20}, manifest).pages).toEqual([]);
  });
});
