document.addEventListener("DOMContentLoaded", function () {
  // Mapping of ids → destinations
  const linkMap = {
    "pangyplot-navbar":        "navbar.html",
    "pangyplot-coordinates":   "regions.html#selecting-by-coordinate",
    "pangyplot-chromosomes":   "regions.html#selecting-by-chromosome",
    "pangyplot-locus":         "regions.html#selecting-by-chromosome",
    "pangyplot-genes":         "regions.html#selecting-by-gene",
    "pangyplot-canvas":        "visuals.html",
    "pangyplot-color":         "colors.html",
    "pangyplot-tools":         "tools.html"
  };

  // Loop over the mapping and attach listeners
  Object.entries(linkMap).forEach(([id, url]) => {
    console.log(id, url);
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", () => {
        window.location.href = url;
      });

      // Optional keyboard accessibility
      el.setAttribute("tabindex", "0");
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          window.location.href = url;
        }
      });
    }
  });
});
