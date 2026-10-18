import { Injectable } from '@angular/core';

/**
 * Lịch sử sách đã xem gần đây — lưu trên thiết bị qua localStorage.
 *
 * Contract:
 * - Key: `vinabook_recently_viewed`, chỉ lưu mảng product ID (number nguyên dương).
 * - Mới xem nhất đứng đầu; xem lại ID cũ sẽ được đưa lên đầu; tối đa 8 ID.
 * - JSON hỏng / sai kiểu / ID không hợp lệ: tự làm sạch an toàn, không crash.
 * - Thông tin chi tiết sách luôn map từ ProductService/catalog hiện có,
 *   service này KHÔNG lưu snapshot sản phẩm.
 */
@Injectable({ providedIn: 'root' })
export class RecentlyViewedService {

  /** Key localStorage — ghi trong docs/localstorage.md. */
  readonly storageKey = 'vinabook_recently_viewed';

  private readonly maxItems = 8;

  /** Đọc danh sách ID đã xem (mới nhất trước). Dữ liệu hỏng -> rỗng. */
  getIds(): number[] {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(this.storageKey);
    } catch {
      return [];
    }

    if (!raw) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.clear();
      return [];
    }

    if (!Array.isArray(parsed)) {
      this.clear();
      return [];
    }

    const ids: number[] = [];
    for (const value of parsed) {
      const id = this.normalizeId(value);
      if (id !== null && !ids.includes(id)) {
        ids.push(id);
      }
    }
    return ids.slice(0, this.maxItems);
  }

  /**
   * Ghi nhận một lượt xem: đưa ID lên đầu danh sách, khử trùng, giới hạn 8.
   * ID âm/0/NaN/thập phân/chuỗi/không hợp lệ bị bỏ qua im lặng.
   */
  add(productId: number): void {
    const id = this.normalizeId(productId);
    if (id === null) {
      return;
    }

    const ids = this.getIds().filter(existing => existing !== id);
    ids.unshift(id);

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(ids.slice(0, this.maxItems)));
    } catch {
      // Storage đầy/bị chặn: tính năng im lặng, không làm trang lỗi.
    }
  }

  /** Xóa toàn bộ lịch sử đã xem. */
  clear(): void {
    this.safeRemove();
  }

  private normalizeId(value: unknown): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }
    if (!Number.isInteger(value) || value <= 0) {
      return null;
    }
    return value;
  }

  private safeRemove(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Bỏ qua: môi trường chặn storage.
    }
  }
}
