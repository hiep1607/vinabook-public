import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { HomepageConfig } from '../common/HomepageConfig';

@Injectable({ providedIn: 'root' })
export class HomepageService {
  private readonly url = environment.apiUrl + '/api/homepage';

  constructor(private http: HttpClient) { }

  getConfig(): Observable<HomepageConfig> {
    return this.http.get<HomepageConfig>(this.url);
  }

  updateConfig(config: HomepageConfig): Observable<HomepageConfig> {
    return this.http.put<HomepageConfig>(this.url, config);
  }
}
