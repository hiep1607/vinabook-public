import { Injectable } from '@angular/core';
import { Login } from '../common/Login';
import jwt_decode from 'jwt-decode';

const TOKEN_KEY = 'auth-token';
const ADMIN_KEY = 'is-admin';

@Injectable({
  providedIn: 'root'
})
export class SessionService {

  login!: Login;
  data!: any;

  constructor() { }

  signOut(): void {
    window.sessionStorage.clear();
  }

  public saveToken(token: string) {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.setItem(TOKEN_KEY, token);
  }

  public markAdmin(): void {
    sessionStorage.setItem(ADMIN_KEY, 'true');
  }

  public isAdmin(): boolean {
    return sessionStorage.getItem(ADMIN_KEY) === 'true';
  }

  public getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  public getUser(): any {
    try {
      const token = this.getToken();
      if (!token) {
        return null;
      }
      const payload: any = jwt_decode(String(token));
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        this.signOut();
        return null;
      }
      return payload.sub;
    }
    catch (Error) {
      return null;
    }
  }
}
