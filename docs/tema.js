(function () {
  var t = localStorage.getItem('tema');
  if (t === 'oscuro' || t === 'claro') document.documentElement.setAttribute('data-tema', t);
})();
