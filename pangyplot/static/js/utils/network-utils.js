export function buildUrl(base, params) {
    return `${base}?${Object.entries(params).map(([key, value]) => `${key}=${value}`).join('&')}`;
}

export async function fetchData(url, logLabel = '') {
    try {
        const response = await fetch(url);
        if (response.status === 404) {
            throw new Error(`Resource not found (404): during ${logLabel}`);
        }
        if (!response.ok) {
            throw new Error(`Network response was not ok: during ${logLabel}`);
        }
        return await response.json();
    } catch (error) {
        if (error.message.includes('404')) {
            console.error(`404 Error for ${logLabel}:`, error);
        } else {
            console.error(`There was a problem with ${logLabel}:`, error);
        }
        throw error;
    }
}
