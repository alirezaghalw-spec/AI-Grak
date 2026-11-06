self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  // برای سادگی، درخواست‌ها را کش نمی‌کنیم تا همیشه به‌روز باشند
});
