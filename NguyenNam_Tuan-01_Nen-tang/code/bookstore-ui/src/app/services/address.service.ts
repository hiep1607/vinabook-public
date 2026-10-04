import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AddressService {

  private key(email: string): string {
    return 'addresses_' + email;
  }

  getAddresses(email: string): any[] {

    const saved = localStorage.getItem(this.key(email));
    return saved ? JSON.parse(saved) : [];

  }

  saveAddresses(email: string, addresses: any[]): void {

    localStorage.setItem(
      this.key(email),
      JSON.stringify(addresses)
    );

  }

  addAddress(email: string, form: any): any {

    const addresses = this.getAddresses(email);

    const newAddress = {
      id: Date.now(),
      label: (form.label || '').trim() || 'Địa chỉ',
      name: (form.name || '').trim(),
      phone: (form.phone || '').trim(),
      street: (form.street || '').trim(),
      isDefault: addresses.length === 0
    };

    addresses.push(newAddress);
    this.saveAddresses(email, addresses);

    return newAddress;

  }

  updateAddress(email: string, id: number, form: any): void {

    const addresses = this.getAddresses(email);

    const index = addresses.findIndex(a => a.id === id);

    if (index !== -1) {
      addresses[index] = {
        ...addresses[index],
        label: (form.label || '').trim() || 'Địa chỉ',
        name: (form.name || '').trim(),
        phone: (form.phone || '').trim(),
        street: (form.street || '').trim()
      };
      this.saveAddresses(email, addresses);
    }

  }

  deleteAddress(email: string, id: number): void {

    let addresses = this.getAddresses(email);

    const deleted = addresses.find(a => a.id === id);

    addresses = addresses.filter(a => a.id !== id);

    if (deleted && deleted.isDefault && addresses.length > 0) {
      addresses[0].isDefault = true;
    }

    this.saveAddresses(email, addresses);

  }

  setDefault(email: string, id: number): void {

    const addresses = this.getAddresses(email);

    addresses.forEach(a => {
      a.isDefault = a.id === id;
    });

    this.saveAddresses(email, addresses);

  }

  getDefault(email: string): any {

    const addresses = this.getAddresses(email);
    return addresses.find(a => a.isDefault) || null;

  }

}
