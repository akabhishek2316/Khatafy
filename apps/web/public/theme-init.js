(function () {
  try {
    var p = localStorage.getItem('kh.theme') || 'light';
    var dark = p === 'dark' || (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) { document.documentElement.dataset.theme = 'light'; }
})();
