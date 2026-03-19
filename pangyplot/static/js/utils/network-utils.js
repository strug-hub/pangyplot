import { getCurrentLang } from "@ui/sections/locale.js";

export function buildUrl(base, params = {}) {
  // inject current language
  const lang = getCurrentLang();
  params.lang = lang;

  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  return query ? `${base}?${query}` : base;
}


export async function fetchData(url, logLabel = '', binary = false) {
  try {
    // Ensure lang=xx is present even if caller passed raw URL
    const currentLang = getCurrentLang();
    const hasLang = url.includes("lang=");
    const finalUrl = hasLang
      ? url
      : url + (url.includes("?") ? "&" : "?") + `lang=${encodeURIComponent(currentLang)}`;

    const response = await fetch(finalUrl);

    if (response.status === 404) {
      throw new Error(`Resource not found (404): during ${logLabel}`);
    }
    if (!response.ok) {
      throw new Error(`Network response was not ok: during ${logLabel}`);
    }

    return binary
      ? new Uint8Array(await response.arrayBuffer())
      : await response.json();

  } catch (error) {
    if (error.message.includes("404")) {
      console.error(`404 Error for ${logLabel}:`, error);
    } else {
      console.error(`Problem with ${logLabel}:`, error);
    }
    throw error;
  }
}
