import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Product } from '../common/Product';
import { environment } from 'src/environments/environment';
import { ProductPreviewManifest, ProductPreviewPage } from '../common/ProductPreview';

@Injectable({
  providedIn: 'root'
})
export class ProductService {

  url = environment.apiUrl + "/api/products";

  constructor(private httpClient: HttpClient) { }

  getAll() {
    return this.httpClient.get(this.url);
  }

  getOne(id: number) {
    return this.httpClient.get(this.url + '/' + id);
  }

  getBestSeller() {
    return this.httpClient.get(this.url + '/bestseller-admin');
  }

  save(product: Product) {
    return this.httpClient.post(this.url, product);
  }

  update(product: Product, id: number) {
    return this.httpClient.put(this.url + '/' + id, product);
  }

  delete(id: number) {
    return this.httpClient.delete(this.url + '/' + id);
  }

  getPreview(productId: number) {
    return this.httpClient.get<ProductPreviewManifest>(`${environment.apiUrl}/api/admin/products/${productId}/preview`);
  }

  addPreviewPage(productId: number, page: ProductPreviewPage) {
    return this.httpClient.post<ProductPreviewPage>(`${environment.apiUrl}/api/admin/products/${productId}/preview/pages`, page);
  }

  updatePreviewPage(productId: number, pageId: number, page: ProductPreviewPage) {
    return this.httpClient.put<ProductPreviewPage>(`${environment.apiUrl}/api/admin/products/${productId}/preview/pages/${pageId}`, page);
  }

  updatePreviewSettings(productId: number, enabled: boolean, rightsConfirmed: boolean) {
    return this.httpClient.put<ProductPreviewManifest>(`${environment.apiUrl}/api/admin/products/${productId}/preview`, {
      enabled,
      rightsConfirmed
    });
  }

  deletePreviewPage(productId: number, pageId: number) {
    return this.httpClient.delete(`${environment.apiUrl}/api/admin/products/${productId}/preview/pages/${pageId}`);
  }

  reorderPreviewPages(productId: number, pageIds: number[]) {
    return this.httpClient.put<ProductPreviewManifest>(`${environment.apiUrl}/api/admin/products/${productId}/preview/reorder`, pageIds);
  }
}
