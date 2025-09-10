let showTimeout = null;
export function showLoader() {
  if (showTimeout) clearTimeout(showTimeout);

  showTimeout = setTimeout(() => {
    document.querySelector('.loader')?.classList.remove("hidden");
    document.querySelector('.loader-filter')?.classList.remove("hidden");
    showTimeout = null; // reset
  }, 100);
}

export function hideLoader() {
  if (showTimeout) {
    clearTimeout(showTimeout);
    showTimeout = null;
  }

  document.querySelector('.loader')?.classList.add("hidden");
  document.querySelector('.loader-filter')?.classList.add("hidden");
}