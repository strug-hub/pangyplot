const supportedLocales = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt_BR", label: "Português (Brasil)" },
  { code: "ru", label: "Русский" },
  { code: "zh_Hans_CN", label: "简体中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "ar", label: "العربية" }
];


import { getCurrentLang } from "@app-state";

function setLang(lang) {
  const params = new URLSearchParams(window.location.search);
  params.set("lang", lang);
  window.location.search = params.toString();
}

function buildDropdown(currentLang) {
  const dropdown = document.getElementById("language-dropdown");
  dropdown.innerHTML = ""; // clear any existing items

  supportedLocales.forEach(locale => {
    const option = document.createElement("div");
    option.className = "lang-option";
    option.textContent = locale.label;
    option.dataset.code = locale.code;

    if (locale.code === currentLang) {
      option.classList.add("selected");
    }

    option.addEventListener("click", () => setLang(locale.code));
    dropdown.appendChild(option);
  });
}

function toggleDropdown() {
  document.getElementById("language-dropdown").classList.toggle("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  const currentLang = getCurrentLang();
  buildDropdown(currentLang);

  document.getElementById("language-button")
    .addEventListener("click", toggleDropdown);

  // Optional: close dropdown when clicking outside
  document.addEventListener("click", (event) => {
    const dropdown = document.getElementById("language-dropdown");
    const button = document.getElementById("language-button");
    if (!dropdown.contains(event.target) && !button.contains(event.target)) {
      dropdown.classList.add("hidden");
    }
  });
});
