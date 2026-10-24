import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  message = '';
  visible = false;

  type: 'success' | 'error' | 'info' = 'success';

  private hideTimer: any;

  success(message: string) {
    this.show(message, 'success');
  }

  error(message: string) {
    this.show(message, 'error');
  }

  info(message: string) {
    this.show(message, 'info');
  }

  private show(message: string, type: 'success' | 'error' | 'info'): void {
    clearTimeout(this.hideTimer);
    this.message = message;
    this.type = type;
    this.visible = true;
    this.hideTimer = setTimeout(() => {
      this.visible = false;
    }, 2600);
  }
}
