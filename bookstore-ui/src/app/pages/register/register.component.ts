import { Component } from '@angular/core';

import { Router } from '@angular/router';

import { AuthService } from 'src/app/services/auth.service';

import { NotificationService } from 'src/app/services/notification.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent {

  name = '';

  email = '';

  password = '';

  confirmPassword = '';

  phone = '';

  errorMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private notification: NotificationService
  ) {}

  register() {

    this.errorMessage = '';

    if (!this.name || !this.name.trim()) {
      this.errorMessage = 'Vui lòng nhập họ và tên';
      return;
    }

    if (!this.email || !this.email.trim()) {
      this.errorMessage = 'Vui lòng nhập địa chỉ email';
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(this.email.trim())) {
      this.errorMessage = 'Địa chỉ email không hợp lệ';
      return;
    }

    if (!this.phone || !this.phone.trim()) {
      this.errorMessage = 'Vui lòng nhập số điện thoại';
      return;
    }

    const phoneRegex = /^0[0-9]{9}$/;
    if (!phoneRegex.test(this.phone.trim())) {
      this.errorMessage = 'Số điện thoại phải bắt đầu bằng số 0 và có đúng 10 chữ số';
      return;
    }

    if (!this.password) {
      this.errorMessage = 'Vui lòng nhập mật khẩu';
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage = 'Mật khẩu phải có ít nhất 6 ký tự';
      return;
    }

    if (!this.confirmPassword) {
      this.errorMessage = 'Vui lòng xác nhận mật khẩu';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Mật khẩu xác nhận không khớp';
      return;
    }

    const user = {
      name: this.name.trim(),
      email: this.email.trim(),
      password: this.password,
      phone: this.phone.trim()
    };

    this.authService.register(user).subscribe(result => {

      if (!result.success) {

        this.errorMessage = result.error!;

        return;

      }

      this.notification.success('Đăng ký thành công');

      this.router.navigate(['/login'], { queryParams: { registered: 'true' } });

    });

  }

}
