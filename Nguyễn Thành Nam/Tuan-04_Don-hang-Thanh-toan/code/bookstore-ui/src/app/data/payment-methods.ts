export interface PaymentMethod {
  id: string;
  label: string;
  description: string;
  icon: string;
}

/**
 * Chỉ công bố phương thức đã có quy trình xác nhận ở backend.
 * Không thêm QR hoặc form thẻ nếu chưa tích hợp cổng thanh toán thật.
 */
export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'cod',
    label: 'Thanh toán khi nhận hàng (COD)',
    description: 'Thanh toán cho nhân viên giao hàng sau khi nhận kiện sách',
    icon: 'COD'
  }
];
