export const environment = {
  production: true,
  // Production uses the same origin. The hosting layer must proxy /api to Spring Boot.
  // This prevents deployed browsers from accidentally calling their own localhost.
  apiUrl: ''
};
