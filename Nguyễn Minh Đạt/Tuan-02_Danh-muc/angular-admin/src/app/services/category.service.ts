import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Category } from '../common/Category';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  url = environment.apiUrl + "/api/categories";
  constructor(private httpClient: HttpClient) { }
  
  getAll() {
    return this.httpClient.get(this.url);
  }

  getOne(id: number) {
    return this.httpClient.get(this.url + '/' + id);
  }

  post(category: Category) {
    return this.httpClient.post(this.url, category);
  }

  put(id: number, category: Category) {
    return this.httpClient.put(this.url + '/' + id, category);
  }

  delete(id: number) {
    return this.httpClient.delete(this.url + '/' + id);
  }
}
