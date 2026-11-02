/** Local checkout interpretation. Shipping input must never be sent to the AI. */
export function normalizePurchaseText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

export function isBookChange(value: string): boolean {
  const q = normalizePurchaseText(value);
  if (/^(?:(?:toi|minh|t) )?(?:lay|mua|dat) \d{1,3} (?:cuon|quyen|ban)[.!]*$/.test(q)) return false;
  return !/\b(khong|chua|dung)\b/.test(q) &&
    /^(?:(?:toi|minh|t|em)\s+)?(?:(?:muon|can)\s+)?(?:mua|dat|chot|lay|doi sang|chuyen sang)\s+\S+/.test(q)
    && !/^(?:xac nhan|chot(?: don)?|dat don|dat hang|mua ngay)(?: nhe| nha| di)?[.!]*$/.test(q);
}

export function isPurchaseQuestion(value: string): boolean {
  const q = normalizePurchaseText(value);
  return /[?？]/.test(q) || /\b(bao nhieu|the nao|tai sao|vi sao|duoc khong|khong a|khong nhi|khi nao|co gi|phi ship|phi giao|noi dung|tom tat|thong diep|giao may ngay|may ngay|thanh toan|doi tra)\b/.test(q)
    || /^(cho hoi|minh hoi|cho minh hoi|co |sach |cuon )/.test(q);
}
