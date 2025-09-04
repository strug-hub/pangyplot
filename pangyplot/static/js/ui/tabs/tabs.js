function switchTab(tabId) {
    // clear all buttons
    var buttonDivs = document.getElementsByClassName("tab-button");
    for (var i = 0; i < buttonDivs.length; i++) {
        buttonDivs[i].classList.remove("active-tab-button"); 
    }

    // clear all contents
    var contentDivs = document.getElementsByClassName("tab-content");
    for (var i = 0; i < contentDivs.length; i++) {
        contentDivs[i].classList.remove("active-tab-content"); 
    }

    // activate chosen tab
    var activeContentDiv = document.getElementById(tabId + "-content");
    if (activeContentDiv) {
        activeContentDiv.classList.add("active-tab-content");
    }
    var activeTabDiv = document.getElementById(tabId + "-button");
    if (activeTabDiv) {
        activeTabDiv.classList.add("active-tab-button");
    }

    // remember this tab
    localStorage.setItem("activeTab", tabId);
}

// restore last tab on page load
window.addEventListener("DOMContentLoaded", function () {
    var savedTab = localStorage.getItem("activeTab");
    if (savedTab && document.getElementById(savedTab + "-button")) {
        switchTab(savedTab);
    } else {
        // fallback: open default tab
        switchTab("keyboard-shortcuts");
    }
});
