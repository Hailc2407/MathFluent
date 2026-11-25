(function () {
  if (window.top !== window.self) document.documentElement.style.display = "none";
  var get = function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  if ((get("mf.set") || {}).lang === "en") document.documentElement.lang = "en";
  var t = get("mf.theme");
  if (t !== "light" && t !== "dark") t = window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.dataset.theme = t;
})();
