import { Component, OnInit } from '@angular/core';
import { ChatAnalyticsService, ChatMetrics } from '../../services/chat-analytics.service';
import { PageService } from '../../services/page.service';

interface IntentRow { key: string; label: string; count: number; rate: number; }

@Component({
  selector: 'app-chat-analytics',
  templateUrl: './chat-analytics.component.html',
  styleUrls: ['./chat-analytics.component.css']
})
export class ChatAnalyticsComponent implements OnInit {
  loading = true;
  error = '';
  metrics?: ChatMetrics;
  intents: IntentRow[] = [];

  private readonly labels: Record<string, string> = {
    DISCOVER_BOOKS: 'Tìm và gợi ý sách',
    PRODUCT_INFO: 'Thông tin sản phẩm',
    COMPARE_BOOKS: 'So sánh sách',
    POLICY: 'Chính sách cửa hàng',
    ORDER_SUPPORT: 'Hỗ trợ đơn hàng',
    SMALL_TALK: 'Chào hỏi',
    UNKNOWN: 'Chưa nhận diện'
  };

  constructor(private analytics: ChatAnalyticsService, private pages: PageService) {}

  ngOnInit(): void {
    this.pages.setPageActive('chatbot-analytics');
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.analytics.getMetrics().subscribe({
      next: metrics => {
        this.metrics = metrics;
        this.intents = Object.entries(metrics.intents || {})
          .map(([key, count]) => ({
            key,
            label: this.labels[key] || key,
            count,
            rate: metrics.totalMessages ? count * 100 / metrics.totalMessages : 0
          }))
          .sort((left, right) => right.count - left.count);
        this.loading = false;
      },
      error: () => {
        this.error = 'Không tải được dữ liệu chatbot. Vui lòng kiểm tra kết nối và quyền quản trị.';
        this.loading = false;
      }
    });
  }

  get satisfactionRate(): number {
    if (!this.metrics) return 0;
    const total = this.metrics.positiveFeedback + this.metrics.negativeFeedback;
    return total ? this.metrics.positiveFeedback * 100 / total : 0;
  }
}
