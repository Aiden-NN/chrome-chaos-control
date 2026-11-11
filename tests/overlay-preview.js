document.getElementById('open').addEventListener('click', () => {
  const script = document.createElement('script');
  script.src = '/extension/overlay.js';
  script.addEventListener('load', () => script.remove());
  document.body.append(script);
});
