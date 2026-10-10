import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CoverImageService {

  private readonly cloudinaryUploadMarker = '/image/upload/';
  private readonly coverTransform = 'e_trim:10/c_limit,w_700,h_1000/q_auto:good';
  private readonly legacyCoverTransform = 'e_trim:10/c_fill,g_auto,w_700,h_1000/q_auto:good';

  normalize(source: string): string {
    const url = (source || '').trim();
    if (!url || !url.includes('res.cloudinary.com') || !url.includes(this.cloudinaryUploadMarker)) {
      return url;
    }

    if (url.includes(`/${this.coverTransform}/`)) {
      return url;
    }

    if (url.includes(`/${this.legacyCoverTransform}/`)) {
      return url.replace(`/${this.legacyCoverTransform}/`, `/${this.coverTransform}/`);
    }

    return url.replace(
      this.cloudinaryUploadMarker,
      `${this.cloudinaryUploadMarker}${this.coverTransform}/`
    );
  }
}
