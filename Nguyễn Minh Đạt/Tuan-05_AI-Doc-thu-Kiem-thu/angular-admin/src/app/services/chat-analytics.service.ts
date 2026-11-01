import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface ChatMetrics {
  totalMessages: number;
  fallbackCount: number;
  fallbackRate: number;
  positiveFeedback: number;
  negativeFeedback: number;
  averageLatencyMs: number;
  intents: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class ChatAnalyticsService {
  private readonly url = environment.apiUrl + '/api/chat/admin/metrics';

  constructor(private http: HttpClient) {}

  getMetrics(): Observable<ChatMetrics> {
    return this.http.get<ChatMetrics>(this.url);
  }
}
