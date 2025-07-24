export function buildUrl(base, params) {
    return `${base}?${Object.entries(params).map(([key, value]) => `${key}=${value}`).join('&')}`;
}

export function fetchData(url, logLabel = '') {
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Network response was not ok: during ${logLabel}`);
            }
            return response.json();
        })
        .then(data => {
            return data;
        })
        .catch(error => {
            console.error(`There was a problem with ${logLabel}:`, error);
        });
}

