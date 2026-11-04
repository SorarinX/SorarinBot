
  (function () {
    var root = document.documentElement;
    var params = new URLSearchParams(location.search);
    var saved = null;
    try { saved = localStorage.getItem('sorarin-installer-theme'); } catch (error) {}
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = params.get('theme') || saved || (prefersDark ? 'dark' : 'light');
    root.classList.toggle('dark', theme === 'dark');
    if (params.get('still') === '1') root.setAttribute('data-motion', 'off');
  })();

