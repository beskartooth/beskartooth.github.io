/* Cookieless page view. Does nothing until GOATCOUNTER_CODE is set in config.js. */
(function () {
  var code = typeof GOATCOUNTER_CODE === "string" ? GOATCOUNTER_CODE.trim() : "";
  if (!code || !/^[A-Za-z0-9-]+$/.test(code)) return;
  var origin = "https://" + code + ".goatcounter.com";
  var script = document.createElement("script");
  script.async = true;
  script.src = origin + "/count.js";
  script.setAttribute("data-goatcounter", origin + "/count");
  document.head.appendChild(script);
})();
