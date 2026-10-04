import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { FabCollisionService } from './fab-collision.service';

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

describe('FabCollisionService', () => {
  let service: FabCollisionService;

  beforeEach(() => {
    const routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);
    (routerSpy as any).events = of();

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: routerSpy }]
    });
    service = TestBed.inject(FabCollisionService);
  });

  it('không nâng FAB ở desktop (>560px)', fakeAsync(() => {
    spyOnProperty(window, 'innerWidth').and.returnValue(1280);

    const fab = document.createElement('button');
    const cta = document.createElement('button');
    cta.className = 'cart-btn';
    document.body.appendChild(cta);
    document.body.appendChild(fab);

    spyOn(fab, 'getBoundingClientRect').and.returnValue(makeRect(300, 700, 48, 48));
    spyOn(cta, 'getBoundingClientRect').and.returnValue(makeRect(31, 742, 314, 58));

    let lift = -1;
    service.watch(() => fab).subscribe(value => { lift = value; });
    service.recheck();
    tick(80);

    expect(lift).toBe(0);
    fab.remove();
    cta.remove();
  }));

  it('nâng FAB ở tablet nhỏ (768px) khi sticky bar giao vùng đứng', fakeAsync(() => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(768);

    const fab = document.createElement('button');
    const barBtn = document.createElement('button');
    // Nút trong sticky buy bar tái dùng class .buy-btn -> được service nhận diện.
    barBtn.className = 'buy-btn';
    document.body.appendChild(barBtn);
    document.body.appendChild(fab);

    // Sticky bar full-width ở đáy viewport; nút bar giao cột x của FAB.
    spyOn(fab, 'getBoundingClientRect').and.returnValue(makeRect(708, 980, 56, 56));
    spyOn(barBtn, 'getBoundingClientRect').and.returnValue(makeRect(200, 952, 560, 44));

    let lift = -1;
    service.watch(() => fab).subscribe(value => { lift = value; });
    service.recheck();
    tick(80);

    // lift = baseBottomEdge(1036) - cta.top(952) + gap(8) = 92
    expect(lift).toBe(92);
    fab.remove();
    barBtn.remove();
  }));


  it('nâng đủ để FAB không còn giao CTA ở mobile 390px', fakeAsync(() => {
    spyOnProperty(window, 'innerWidth').and.returnValue(390);

    const fab = document.createElement('button');
    const cta = document.createElement('button');
    cta.className = 'cart-btn'; // "Thêm giỏ hàng"
    document.body.appendChild(cta);
    document.body.appendChild(fab);

    // Số liệu thực đo trên /product/57 @390x844:
    // FAB gốc 315.2..363.2 x 784..832 ; CTA 31..344.2 x 785.8..843.8
    const fabRect = makeRect(315.2, 784, 48, 48);
    const ctaRect = makeRect(31, 785.8, 313.2, 58);
    spyOn(fab, 'getBoundingClientRect').and.returnValue(fabRect);
    spyOn(cta, 'getBoundingClientRect').and.returnValue(ctaRect);
    expect(rectsIntersect(fabRect, ctaRect)).toBe(true); // trạng thái lỗi ban đầu

    let lift = -1;
    service.watch(() => fab).subscribe(value => { lift = value; });
    service.recheck();
    tick(80);

    // lift = baseBottomEdge(832) - cta.top(785.8) + gap(8) = 54.2 -> làm tròn bởi CSS px
    expect(lift).toBeCloseTo(54.2, 5);

    // Sau khi nâng: hình chữ nhật FAB mới phải không giao CTA.
    const liftedFab = makeRect(fabRect.left, fabRect.top - lift, fabRect.width, fabRect.height);
    expect(rectsIntersect(liftedFab, ctaRect)).toBe(false);
    fab.remove();
    cta.remove();
  }));

  it('không nâng khi CTA ở ngoài cột của FAB', fakeAsync(() => {
    spyOnProperty(window, 'innerWidth').and.returnValue(360);

    const fab = document.createElement('button');
    const cta = document.createElement('button');
    cta.className = 'page-btn'; // pagination
    document.body.appendChild(cta);
    document.body.appendChild(fab);

    // Pagination nằm lệch trái, không chạm cột x của FAB.
    spyOn(fab, 'getBoundingClientRect').and.returnValue(makeRect(284.8, 740, 48, 48));
    spyOn(cta, 'getBoundingClientRect').and.returnValue(makeRect(20, 750, 60, 44));

    let lift = -1;
    service.watch(() => fab).subscribe(value => { lift = value; });
    service.recheck();
    tick(80);

    expect(lift).toBe(0);
    fab.remove();
    cta.remove();
  }));
});
