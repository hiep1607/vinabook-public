import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Gắn header `ngrok-skip-browser-warning` vào mọi request.
 *
 * Khi chia sẻ demo qua ngrok (bản free), ngrok chèn một trang cảnh báo HTML
 * cho request trình duyệt — khiến lời gọi API (XHR) nhận về HTML thay vì JSON
 * và catalog bị trống. Header này yêu cầu ngrok bỏ qua trang cảnh báo đó.
 *
 * Vô hại khi chạy bình thường (không qua ngrok): server bỏ qua header lạ.
 * Có thể gỡ interceptor này khi không còn dùng tunnel ngrok.
 */
@Injectable()
export class NgrokSkipInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const cloned = req.clone({
      setHeaders: { 'ngrok-skip-browser-warning': 'true' }
    });
    return next.handle(cloned);
  }
}
