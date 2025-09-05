export function setUpNodeSearchUi(){
    const searchBar = document.getElementById("node-search-bar");
    const searchButton = document.getElementById("node-search-button");

    return {searchBar, searchButton};
}

export function updateNodeSearchResults(queryResult){
    const resultsContainer = document.getElementById("node-search-results");
    resultsContainer.innerHTML = "";

    if (queryResult == null) {
        const div = document.createElement("div");
        div.textContent = "No results found";
        div.classList.add("no-data");
        resultsContainer.appendChild(div);
        return;
    }

    queryResult.forEach(result => {
        const div = document.createElement("div");
        div.innerHTML = result.node;
        resultsContainer.appendChild(div);
    });
}