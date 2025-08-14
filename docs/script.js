(function () {
  const root = document.documentElement;
  const toggleBtn = document.getElementById('themeToggle');
  const gif = document.getElementById('demoGif');
  const loader = document.getElementById('gifLoader');

  // ---- Theme Handling ----
  const stored = localStorage.getItem('codemark-theme');
  if (stored === 'dark' || stored === 'light') {
    root.setAttribute('data-theme', stored);
  } else {
    // Auto-detect
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }

  function toggleTheme() {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    localStorage.setItem('codemark-theme', next);
  }

  toggleBtn.addEventListener('click', toggleTheme);

  // ---- Smooth Scroll for internal anchors ----
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', id);
      }
    });
  });

  // ---- GIF Loader ----
  if (gif && loader) {
    // In case of cached
    if (gif.complete && gif.naturalWidth > 0) {
      revealGif();
    } else {
      gif.addEventListener('load', revealGif, { once: true });
      gif.addEventListener('error', () => {
        loader.querySelector('p').textContent = 'Failed to load demo.';
        loader.querySelector('.spinner').style.display = 'none';
      }, { once: true });
    }
  }

  function revealGif() {
    requestAnimationFrame(() => {
      gif.style.opacity = '1';
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 450);
    });
  }
})();
