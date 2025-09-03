export function buildUrl(base, params) {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${base}?${query}`;
}

export async function fetchData(url, logLabel = '', binary = false) {
  try {
    const response = await fetch(url);
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
    if (error.message.includes('404')) {
      console.error(`404 Error for ${logLabel}:`, error);
    } else {
      console.error(`Problem with ${logLabel}:`, error);
    }
    throw error;
  }
}
