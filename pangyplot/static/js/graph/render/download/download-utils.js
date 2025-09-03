import { fetchData } from '../../../utils/network-utils.js';

export function getImageName(fileType) {
    const dateTimeStr = getFormattedDateTime();
    return `pangyplot_${dateTimeStr}.${fileType}`;
}

function getFormattedDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

export async function getFontCss() {
  const family = "Rubik";
  const weight = "bold";
  const fontUrl = "/static/fonts/Rubik-Bold.woff2";

  const bytes = await fetchData(fontUrl, "Rubik font", true);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return `
    @font-face {
      font-family: '${family}';
      src: url('data:font/woff2;base64,${base64}') format('woff2');
      font-weight: ${weight};
      font-style: normal;
      font-display: swap;
    }

    /* All <text> will use Rubik if available, otherwise fall back gracefully */
    text {
      font-family: '${family}', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-weight: ${weight};
    }
  `;
}
