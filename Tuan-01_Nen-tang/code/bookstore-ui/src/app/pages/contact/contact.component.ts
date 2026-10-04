import { Component } from '@angular/core';

import { NotificationService } from 'src/app/services/notification.service';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss']
})
export class ContactComponent {

  form = { name: '', email: '', subject: '', message: '' };
  submitted = false;

  faqs = [
    {
      q: 'Bao lâu thì tôi nhận được sách?',
      a: 'Đơn hàng được xử lý trong 24 giờ và giao trong 2 đến 4 ngày làm việc tùy khu vực. Bạn có thể theo dõi trong mục Đơn hàng của tôi.',
      open: false
    },
    {
      q: 'VinaBook có hỗ trợ đổi trả không?',
      a: 'Sách lỗi in ấn hoặc hư hỏng do vận chuyển được hỗ trợ đổi trả trong 7 ngày kể từ khi nhận hàng.',
      open: false
    },
    {
      q: 'Tôi có thể thanh toán bằng hình thức nào?',
      a: 'Hiện tại VinaBook chỉ nhận thanh toán khi giao hàng (COD). Thanh toán trực tuyến sẽ được mở sau khi kết nối với cổng thanh toán được xác thực.',
      open: false
    },
    {
      q: 'Làm sao để theo dõi đơn hàng?',
      a: 'Đăng nhập và mở mục Đơn hàng của tôi. Trạng thái chờ xử lý, đang giao, hoàn thành hoặc đã hủy được cập nhật từ hệ thống quản trị.',
      open: false
    },
    {
      q: 'Phí vận chuyển được tính thế nào?',
      a: 'Phí vận chuyển là 20.000đ. Đơn hàng từ 300.000đ được miễn phí vận chuyển.',
      open: false
    }
  ];

  constructor(private notification: NotificationService) {}

  isValid(): boolean {
    return this.form.name.trim().length > 0
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email.trim())
      && this.form.message.trim().length > 0;
  }

  submit(): void {
    this.submitted = true;

    if (!this.isValid()) {
      this.notification.error('Vui lòng điền đầy đủ họ tên, email hợp lệ và nội dung');
      return;
    }

    const subject = encodeURIComponent(this.form.subject.trim() || 'Yêu cầu hỗ trợ từ website VinaBook');
    const body = encodeURIComponent(
      `Họ tên: ${this.form.name.trim()}\nEmail: ${this.form.email.trim()}\n\n${this.form.message.trim()}`
    );

    window.location.href = `mailto:hotro@vinabook.vn?subject=${subject}&body=${body}`;
    this.notification.info('Ứng dụng email đã được mở. Vui lòng kiểm tra và bấm Gửi.');
  }

  toggleFaq(faq: any): void {
    faq.open = !faq.open;
  }
}
