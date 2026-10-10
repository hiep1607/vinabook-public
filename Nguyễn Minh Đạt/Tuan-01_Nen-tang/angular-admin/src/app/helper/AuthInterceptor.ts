import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { SessionService } from '../services/session.service';

/**
 * Gắn header `Authorization: Bearer <token>` vào mọi request gọi API, lấy
 * token từ SessionService (sessionStorage). Không có token (chưa đăng nhập,
 * ví dụ màn hình login) thì request đi qua không sửa đổi.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private session: SessionService) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.session.getToken();
    if (!token) {
      return next.handle(req);
    }
    const cloned = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
    return next.handle(cloned);
  }
}
