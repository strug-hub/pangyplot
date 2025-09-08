export class RightClickMenu {
    constructor(forceGraph) {
        this.forceGraph = forceGraph;
        this.options = [];
        this.menuElement = this.createMenuElement();

        document.addEventListener('click', () => this.hideMenu());
    }

    createMenuElement() {
        const menu = document.createElement('div');
        menu.id = 'custom-context-menu';
        document.body.appendChild(menu);
        return menu;
    }
    addOption(iconName, labelText, category, onClickFunction) {
        this.options.push({ iconName, labelText, category, onClickFunction });
    }

    showMenu(x, y) {
        this.menuElement.innerHTML = '';

        const categorizedOptions = this.categorizeOptions();

        this.addLabel('Actions:');
        categorizedOptions.general.forEach(option => this.addOptionToMenu(option));

        if (!this.forceGraph.selected.isEmpty()) {
            this.addLabel('Highlighted node actions:');
            const selectedNodes = this.forceGraph.selected.nodeList();
            categorizedOptions.node.forEach(option => this.addOptionToMenu(option, selectedNodes));
        }

        if (!this.menuElement.innerHTML.trim()) return;

        this.menuElement.style.display = 'block';
        this.menuElement.style.left = `${x}px`;
        this.menuElement.style.top = `${y}px`;

        this.adjustMenuPosition(x, y);
    }

    adjustMenuPosition(pageX, pageY) {
        // graph in page coordinates
        const cRect = this.forceGraph.element.getBoundingClientRect();
        const graphTop    = cRect.top + window.scrollY;
        const graphBottom = cRect.bottom + window.scrollY;
        const graphLeft   = cRect.left + window.scrollX;
        const graphRight  = cRect.right + window.scrollX;

        const mRect = this.menuElement.getBoundingClientRect();
        const mW = mRect.width;
        const mH = mRect.height;

        const spaceBelow = graphBottom - pageY;
        const spaceAbove = pageY - graphTop;

        let top;
        if (spaceBelow < mH && spaceAbove >= mH) {
            top = pageY - mH; // flip above
        } else {
            top = pageY;      // default: below
        }

        // clamp horizontally within graph
        let left = pageX;
        const overflowRight = (pageX + mW) - graphRight;
        if (overflowRight > 0) left -= overflowRight;
        if (left < graphLeft) left = graphLeft;

        this.menuElement.style.left = `${left}px`;
        this.menuElement.style.top  = `${top}px`;
    }

    
    categorizeOptions() {
        return this.options.reduce((categories, option) => {
            if (!categories[option.category]) {
                categories[option.category] = [];
            }
            categories[option.category].push(option);
            return categories;
        }, {});
    }

    addLabel(text) {
        const label = document.createElement('div');
        label.classList.add('context-menu-category-label');
        label.textContent = text;
        this.menuElement.appendChild(label);
    }

    hideMenu() {
        this.menuElement.style.display = 'none';
    }

    addOptionToMenu(option, targetObject = null) {
        const row = document.createElement('div');
        row.classList.add('context-menu-row');

        const icon = document.createElement('i');
        icon.classList.add('fa', `fa-${option.iconName}`);

        const label = document.createElement('span');
        label.textContent = option.labelText;

        row.appendChild(icon);
        row.appendChild(label);

        row.addEventListener('click', e => {
            e.stopPropagation();
            option.onClickFunction(targetObject);
            this.hideMenu();
        });

        this.menuElement.appendChild(row);
    }
}
