/**
 * Set up an autocomplete search dropdown with debounced fetch,
 * keyboard navigation, and blur-to-close behavior.
 *
 * @param {Object} opts
 * @param {HTMLInputElement} opts.input         - The search input element
 * @param {HTMLElement}      opts.dropdown       - The dropdown container element
 * @param {Function}         opts.fetchResults   - (query: string) => Promise<string> — returns HTML to inject
 * @param {Function}         opts.onSelect       - (item: HTMLElement) => void — called when an item is selected
 * @param {string}           [opts.itemClass]    - CSS class for selectable items (default: "search-dropdown-item")
 * @param {number}           [opts.debounceMs]   - Debounce delay in ms (default: 250)
 */
export function setupSearchDropdown({ input, dropdown, fetchResults, onSelect, itemClass = "search-dropdown-item", debounceMs = 250 }) {

    let SWITCH_FOCUS = false;

    function debounce(func, delay) {
        let timer;
        return function () {
            const context = this;
            const args = arguments;
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(context, args), delay);
        };
    }

    input.addEventListener("input", debounce(function () {
        const query = this.value;
        if (query.length > 0) {
            fetchResults(query).then(html => {
                dropdown.setAttribute("tabindex", "-1");
                dropdown.innerHTML = html;
                dropdown.classList.add("active");
            }).catch(error => console.error("Search error:", error));
        } else {
            dropdown.classList.remove("active");
        }
    }, debounceMs));

    function navigateItems(event) {
        const key = event.key;
        const active = document.activeElement;
        if (key === "ArrowDown") {
            if (active.classList.contains(itemClass)) {
                event.preventDefault();
                const next = active.nextElementSibling || active;
                SWITCH_FOCUS = true;
                next.focus();
                SWITCH_FOCUS = false;
            } else {
                const firstItem = dropdown.querySelector("." + itemClass);
                if (firstItem) {
                    event.preventDefault();
                    firstItem.setAttribute("tabindex", "-1");
                    firstItem.focus();
                }
            }
        } else if (key === "ArrowUp") {
            if (active.classList.contains(itemClass)) {
                event.preventDefault();
                const prev = active.previousElementSibling || active;
                SWITCH_FOCUS = true;
                prev.focus();
                SWITCH_FOCUS = false;
            }
        }
    }

    input.addEventListener("keydown", function (event) {
        if (["ArrowUp", "ArrowDown"].includes(event.key)) {
            navigateItems(event);
        }
    });

    dropdown.addEventListener("keydown", function (event) {
        const key = event.key;
        if (["ArrowUp", "ArrowDown"].includes(event.key)) {
            navigateItems(event);
            return;
        }
        if ((key.length === 1 && key.match(/\S/)) || key === "Backspace") {
            input.focus();
            input.dispatchEvent(new Event("input"));
        }
    });

    dropdown.addEventListener("wheel", function (event) {
        const deltaY = event.deltaY;
        const contentHeight = this.scrollHeight;
        const visibleHeight = this.offsetHeight;
        const scrollPosition = this.scrollTop;

        if ((scrollPosition === 0 && deltaY < 0) || (scrollPosition + visibleHeight >= contentHeight && deltaY > 0)) {
            event.preventDefault();
        }
    });

    input.addEventListener("blur", function () {
        setTimeout(() => {
            if (!dropdown.contains(document.activeElement)) {
                dropdown.classList.remove("active");
            }
        }, 0);
    });

    dropdown.addEventListener("blur", function () {
        if (!SWITCH_FOCUS && !dropdown.contains(document.activeElement)) {
            if (document.activeElement !== input) {
                dropdown.classList.remove("active");
            }
        }
    }, true);

    // Click/Enter selection
    function selectItem(target) {
        while (target && !target.classList.contains(itemClass)) {
            target = target.parentElement;
        }
        if (target) {
            onSelect(target);
            input.value = "";
            dropdown.classList.remove("active");
        }
    }

    dropdown.addEventListener("click", function (event) { selectItem(event.target); });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && document.activeElement.classList.contains(itemClass)) {
            selectItem(document.activeElement);
        }
    });
}
