export const environment = {
  production: false,
  // Để rỗng → mọi lời gọi API là tương đối ('/api/...'), đi qua proxy của ng serve
  // (xem proxy.conf.json) tới backend localhost:8080. Nhờ vậy frontend + API chung
  // một origin → chia sẻ public qua MỘT tunnel ngrok mà không vướng CORS.
  apiUrl: ''
};
