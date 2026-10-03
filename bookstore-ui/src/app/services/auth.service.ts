import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

/**
 * Auth qua backend Spring Boot (JWT).
 * - signin/signup gọi /api/auth; currentUser (kèm token) lưu localStorage để giữ phiên.
 * - Avatar (base64) chỉ lưu local (key avatar_{email}) — cột image trong DB không chứa nổi base64.
 * - Mật khẩu và bcrypt hash không được lưu trong trình duyệt.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private url = environment.apiUrl + '/api/auth';

  currentUser: any = null;

  constructor(private http: HttpClient) {

    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
        // Sessions created by older builds may contain a bcrypt hash. Never keep it client-side.
        if (this.currentUser && 'password' in this.currentUser) {
          delete this.currentUser.password;
          this.persist();
        }
      } catch {
        this.currentUser = null;
      }
    }

  }

  // ===== ĐĂNG KÝ =====

  register(user: any): Observable<{ success: boolean; error?: string }> {

    const body = {
      name: user.name,
      email: user.email,
      password: user.password,
      phone: user.phone,
      address: '',
      gender: true,
      status: true,
      image: '',
      registerDate: new Date().toISOString().slice(0, 10)
    };

    return this.http.post(this.url + '/signup', body).pipe(
      map(() => ({ success: true })),
      catchError(() => of({
        success: false,
        error: 'Email đã được sử dụng'
      }))
    );

  }

  // ===== ĐĂNG NHẬP =====

  login(email: string, password: string): Observable<boolean> {

    return this.http.post<any>(this.url + '/signin', { email, password }).pipe(
      map(res => {

        this.currentUser = {
          userId: res.id,
          name: res.name,
          email: res.email,
          phone: res.phone,
          address: res.address,
          gender: res.gender,
          status: res.status,
          image: res.image,
          registerDate: res.registerDate,
          token: res.token,
          roles: res.roles,
          avatar: this.loadAvatar(res.email)
        };

        this.persist();
        return true;

      }),
      catchError(() => of(false))
    );

  }

  // ===== CẬP NHẬT THÔNG TIN =====

  updateUser(updates: any): void {

    if (!this.currentUser) {
      return;
    }

    this.currentUser = { ...this.currentUser, ...updates };

    // Avatar chỉ lưu local, không đẩy về backend
    if ('avatar' in updates) {
      this.saveAvatar(this.currentUser.email, updates.avatar);
      this.persist();
      return;
    }

    this.persist();

    // Đồng bộ name/phone/address về backend (fire-and-forget)
    this.http
      .put(this.url + '/' + this.currentUser.userId, this.toUserEntity())
      .subscribe({ error: () => { /* offline thì thông tin vẫn còn ở local */ } });

  }

  // ===== ĐỔI MẬT KHẨU =====

  changePassword(
    currentPwd: string,
    newPwd: string
  ): Observable<{ success: boolean; error?: string }> {

    if (!this.currentUser) {
      return of({ success: false, error: 'Bạn chưa đăng nhập' });
    }

    // Xác thực mật khẩu hiện tại bằng chính endpoint signin
    return this.http
      .post<any>(this.url + '/signin', {
        email: this.currentUser.email,
        password: currentPwd
      })
      .pipe(
        switchMap(() => {
          const body = this.toUserEntity();
          body.password = newPwd; // khác hash đang lưu → backend sẽ encode
          return this.http.put<any>(this.url + '/' + this.currentUser.userId, body).pipe(
            map(updated => {
              this.persist();
              return { success: true };
            })
          );
        }),
        catchError(() => of({
          success: false,
          error: 'Mật khẩu hiện tại không đúng'
        }))
      );

  }

  // ===== PHIÊN =====

  logout(): void {
    this.currentUser = null;
    localStorage.removeItem('currentUser');
  }

  isLoggedIn(): boolean {
    if (!this.currentUser || !this.currentUser.token) {
      return false;
    }

    try {
      const payload = JSON.parse(atob(this.currentUser.token.split('.')[1]));
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        this.logout();
        return false;
      }
    } catch {
      this.logout();
      return false;
    }

    return true;
  }

  // ===== HELPERS =====

  private persist(): void {
    localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
  }

  /** Shape User entity mà backend PUT /api/auth/{id} yêu cầu */
  private toUserEntity(): any {
    const u = this.currentUser;
    return {
      userId: u.userId,
      name: u.name,
      email: u.email,
      phone: u.phone,
      address: u.address || '',
      gender: u.gender !== undefined ? u.gender : true,
      status: u.status !== undefined ? u.status : true,
      image: u.image || '',
      registerDate: u.registerDate
    };
  }

  private avatarKey(email: string): string {
    return 'avatar_' + email;
  }

  private saveAvatar(email: string, avatar: string): void {
    if (avatar) {
      localStorage.setItem(this.avatarKey(email), avatar);
    } else {
      localStorage.removeItem(this.avatarKey(email));
    }
  }

  private loadAvatar(email: string): string {
    return localStorage.getItem(this.avatarKey(email)) || '';
  }

}
