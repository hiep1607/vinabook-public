import { Component, OnInit } from '@angular/core';

import { Router } from '@angular/router';

import { AuthService } from 'src/app/services/auth.service';
import { OrderService } from 'src/app/services/order.service';
import { CartService } from 'src/app/services/cart.service';
import { NotificationService } from 'src/app/services/notification.service';
import { AddressService } from 'src/app/services/address.service';
import { ReviewService } from 'src/app/services/review.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {

  activeTab = 'info';

  // --- Personal info ---
  editName = '';
  editPhone = '';
  infoError = '';

  // --- Avatar ---
  previewAvatar = '';

  // --- Addresses ---
  addresses: any[] = [];
  showAddressForm = false;
  editingAddressId: number | null = null;
  addressForm = {
    label: '',
    name: '',
    phone: '',
    street: ''
  };
  addressError = '';

  // --- Change password ---
  currentPwd = '';
  newPwd = '';
  confirmPwd = '';
  passwordError = '';

  // --- Statistics ---
  stats = {
    totalOrders: 0,
    totalSpent: 0,
    totalReviews: 0,
    cartCount: 0
  };

  // --- Order summary ---
  recentOrders: any[] = [];

  constructor(
    public authService: AuthService,
    private orderService: OrderService,
    private cartService: CartService,
    private notification: NotificationService,
    private addressService: AddressService,
    private reviewService: ReviewService,
    private router: Router
  ) {}

  ngOnInit(): void {

    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    const user = this.authService.currentUser;

    this.editName = user.name || '';
    this.editPhone = user.phone || '';
    this.previewAvatar = user.avatar || '';

    this.loadAddresses();
    this.loadStats();
    this.loadRecentOrders();

  }

  setTab(tab: string): void {
    this.activeTab = tab;
  }

  // ===== PERSONAL INFO =====

  saveInfo(): void {

    this.infoError = '';

    if (!this.editName.trim()) {
      this.infoError = 'Vui lòng nhập họ và tên';
      return;
    }

    if (!this.editPhone.trim()) {
      this.infoError = 'Vui lòng nhập số điện thoại';
      return;
    }

    this.authService.updateUser({
      name: this.editName.trim(),
      phone: this.editPhone.trim()
    });

    this.notification.success('Cập nhật thông tin thành công');

  }

  // ===== AVATAR =====

  onAvatarSelected(event: any): void {

    const file: File = event.target.files && event.target.files[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      this.previewAvatar = reader.result as string;
    };

    reader.readAsDataURL(file);

  }

  saveAvatar(): void {

    if (!this.previewAvatar) {
      return;
    }

    this.authService.updateUser({ avatar: this.previewAvatar });

    this.notification.success('Cập nhật ảnh đại diện thành công');

  }

  removeAvatar(): void {

    this.previewAvatar = '';
    this.authService.updateUser({ avatar: '' });

    this.notification.success('Đã xoá ảnh đại diện');

  }

  // ===== ADDRESSES =====

  private get email(): string {
    return this.authService.currentUser.email;
  }

  loadAddresses(): void {
    this.addresses = this.addressService.getAddresses(this.email);
  }

  openAddAddress(): void {

    this.editingAddressId = null;
    this.addressForm = { label: '', name: '', phone: '', street: '' };
    this.addressError = '';
    this.showAddressForm = true;

  }

  editAddress(address: any): void {

    this.editingAddressId = address.id;
    this.addressForm = {
      label: address.label,
      name: address.name,
      phone: address.phone,
      street: address.street
    };
    this.addressError = '';
    this.showAddressForm = true;

  }

  cancelAddressForm(): void {
    this.showAddressForm = false;
    this.editingAddressId = null;
  }

  saveAddress(): void {

    this.addressError = '';

    if (
      !this.addressForm.name.trim() ||
      !this.addressForm.phone.trim() ||
      !this.addressForm.street.trim()
    ) {
      this.addressError = 'Vui lòng nhập đầy đủ thông tin';
      return;
    }

    if (this.editingAddressId !== null) {
      this.addressService.updateAddress(
        this.email,
        this.editingAddressId,
        this.addressForm
      );
    } else {
      this.addressService.addAddress(this.email, this.addressForm);
    }

    this.loadAddresses();
    this.showAddressForm = false;
    this.editingAddressId = null;
    this.notification.success('Lưu địa chỉ thành công');

  }

  deleteAddress(address: any): void {

    this.addressService.deleteAddress(this.email, address.id);
    this.loadAddresses();
    this.notification.success('Đã xoá địa chỉ');

  }

  setDefaultAddress(address: any): void {

    this.addressService.setDefault(this.email, address.id);
    this.loadAddresses();

  }

  // ===== CHANGE PASSWORD =====

  changePassword(): void {

    this.passwordError = '';

    if (!this.currentPwd) {
      this.passwordError = 'Vui lòng nhập mật khẩu hiện tại';
      return;
    }

    if (this.newPwd.length < 6) {
      this.passwordError = 'Mật khẩu mới phải có ít nhất 6 ký tự';
      return;
    }

    if (this.newPwd !== this.confirmPwd) {
      this.passwordError = 'Mật khẩu xác nhận không khớp';
      return;
    }

    this.authService
      .changePassword(this.currentPwd, this.newPwd)
      .subscribe(result => {

        if (!result.success) {
          this.passwordError = result.error!;
          return;
        }

        this.currentPwd = '';
        this.newPwd = '';
        this.confirmPwd = '';

        this.notification.success('Đổi mật khẩu thành công');

      });

  }

  // ===== STATISTICS =====

  loadStats(): void {

    this.stats.totalReviews = this.countReviews();
    this.stats.cartCount = this.cartService.getCartCount();

    this.orderService.getOrders(this.email).subscribe(orders => {

      this.stats.totalOrders = orders.length;

      this.stats.totalSpent = orders.reduce(
        (total: number, order: any) => total + (order.total || 0),
        0
      );

    });

  }

  private countReviews(): number {
    // Đếm số review của chính user này từ cache rates backend
    return this.reviewService.countByEmail(this.email);
  }

  // ===== ORDER SUMMARY =====

  loadRecentOrders(): void {
    this.orderService.getOrders(this.email).subscribe(orders => {
      this.recentOrders = orders.slice(0, 5);
    });
  }

  // ===== LOGOUT =====

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }

}
