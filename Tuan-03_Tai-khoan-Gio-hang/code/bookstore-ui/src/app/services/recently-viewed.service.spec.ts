import { TestBed } from '@angular/core/testing';

import { RecentlyViewedService } from './recently-viewed.service';

describe('RecentlyViewedService', () => {
  let service: RecentlyViewedService;

  beforeEach(() => {
    localStorage.removeItem('vinabook_recently_viewed');
    service = TestBed.inject(RecentlyViewedService);
  });

  afterEach(() => {
    localStorage.removeItem('vinabook_recently_viewed');
  });

  it('thêm ID mới vào đầu danh sách', () => {
    service.add(5);
    service.add(3);
    expect(service.getIds()).toEqual([3, 5]);
    expect(JSON.parse(localStorage.getItem('vinabook_recently_viewed')!)).toEqual([3, 5]);
  });

  it('xem lại ID cũ sẽ đưa ID đó lên đầu, không tạo trùng', () => {
    [5, 3, 8].forEach(id => service.add(id));
    service.add(5);
    expect(service.getIds()).toEqual([5, 8, 3]);
  });

  it('chỉ giữ tối đa 8 ID, bỏ ID cũ nhất', () => {
    for (let i = 1; i <= 10; i++) {
      service.add(i);
    }
    const ids = service.getIds();
    expect(ids.length).toBe(8);
    expect(ids[0]).toBe(10);
    expect(ids).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
  });

  it('bỏ qua ID âm, 0, NaN, thập phân, chuỗi và giá trị không hợp lệ', () => {
    service.add(-1);
    service.add(0);
    service.add(NaN);
    service.add(2.5);
    service.add('7' as any);
    service.add(undefined as any);
    service.add(null as any);
    expect(service.getIds()).toEqual([]);

    // ID hợp lệ xen giữa các giá trị rác vẫn được lưu đúng.
    service.add(9);
    service.add(-3);
    service.add(4.2);
    expect(service.getIds()).toEqual([9]);
  });

  it('JSON localStorage bị hỏng không làm crash, trả danh sách rỗng', () => {
    localStorage.setItem('vinabook_recently_viewed', '{broken json!!');
    expect(() => service.getIds()).not.toThrow();
    expect(service.getIds()).toEqual([]);
    // add sau khi dữ liệu hỏng vẫn hoạt động (đã tự dọn).
    service.add(3);
    expect(service.getIds()).toEqual([3]);
  });

  it('tự làm sạch dữ liệu sai kiểu / ID không hợp lệ trong mảng', () => {
    localStorage.setItem(
      'vinabook_recently_viewed',
      JSON.stringify(['a', 7, -2, { x: 1 }, null, true, 12])
    );
    expect(service.getIds()).toEqual([7, 12]);
  });

  it('clear() xóa toàn bộ lịch sử khỏi localStorage', () => {
    service.add(4);
    service.add(6);
    service.clear();
    expect(service.getIds()).toEqual([]);
    expect(localStorage.getItem('vinabook_recently_viewed')).toBeNull();
  });
});
