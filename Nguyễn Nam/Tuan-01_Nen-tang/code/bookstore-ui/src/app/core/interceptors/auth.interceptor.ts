import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Gắn header `Authorization: Bearer <token>` vào mọi request, lấy token từ
 * `localStorage.currentUser` trực tiếp (không inject AuthService — AuthService
 * cũng dùng HttpClient nên sẽ gây circular dependency nếu interceptor phụ
 * thuộc vào nó). Chưa đăng nhập thì request đi qua không sửa đổi.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.readToken();
    if (!token) {
      return next.handle(req);
    }
    const cloned = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
    return next.handle(cloned);
  }

  private readToken(): string {
    try {
      const raw = localStorage.getItem('currentUser');
      return raw ? (JSON.parse(raw).token || '') : '';
    } catch {
      return '';
    }
  }
}
