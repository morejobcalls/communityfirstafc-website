// Form submit -> lead relay -> GHL (Community First sub-account). Attribution rides along.
(function () {
  var q = new URLSearchParams(location.search), store;
  try { store = JSON.parse(sessionStorage.getItem('cf_attr') || '{}'); } catch (e) { store = {}; }
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid'].forEach(function (k) { if (q.get(k)) store[k] = q.get(k); });
  if (!store.landing) { store.landing = location.pathname; store.referrer = document.referrer || ''; }
  try { sessionStorage.setItem('cf_attr', JSON.stringify(store)); } catch (e) {}
  document.querySelectorAll('form[data-cf-form]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = f.querySelector('button'), err = f.querySelector('.err');
      if (!err) { err = document.createElement('p'); err.className = 'err'; b.after(err); }
      err.textContent = '';
      var data = {}; new FormData(f).forEach(function (v, k) { data[k] = v; });
      if (String(data.phone || '').replace(/\D/g, '').length < 10) { err.textContent = 'Please enter a 10-digit phone number.'; return; }
      data.kind = f.getAttribute('data-cf-form'); data.page = location.pathname; data.attribution = store;
      b.disabled = true; b.textContent = 'Sending...';
      fetch(window.CF_RELAY + '/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) throw new Error(j.error || 'fail');
          var d = document.createElement('div'); d.className = 'cf-done'; d.textContent = j.message; f.parentNode.replaceChild(d, f);
          d.scrollIntoView({ behavior: 'smooth', block: 'center' });
        })
        .catch(function () { b.disabled = false; b.textContent = 'Try again'; err.innerHTML = 'Something went wrong sending this. Please call <a href="tel:+15083049782">508-304-9782</a>.'; });
    });
  });
})();
