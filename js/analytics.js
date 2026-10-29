/* One cookieless page view for Comic Studio.
   Same Abacus namespace as the link tree (beskartooth-links) and the same
   besky-notrack opt-out. A failed or blocked request is ignored. */
(function () {
  try {
    if (/[?&]notrack/.test(location.search)) return;
    if (localStorage.getItem("besky-notrack")) return;
    fetch("https://abacus.jasoncameron.dev/hit/beskartooth-links/comic-studio-page-views", {
      mode: "cors",
      keepalive: true
    }).catch(function () {});
  } catch (e) {}
})();
