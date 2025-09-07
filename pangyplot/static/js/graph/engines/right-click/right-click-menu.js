import { getSelectedNodeSet } from '../selection/selection-state.js';

export class RightClickMenu {
    constructor(forceGraph) {
        this.forceGraph = forceGraph;
        this.options = [];
        this.menuElement = this.createMenuElement();

        document.addEventListener('click', () => this.hideMenu());
    }

    createMenuElement() {
        const menu = document.createElement('div');
        menu.classList.add('custom-context-menu');
        document.body.appendChild(menu);
        return menu;
    }

    addOption(iconName, labelText, category, onClickFunction) {
        this.options.push({ iconName, labelText, category, onClickFunction });
    }

    showMenu(x, y) {
        this.menuElement.innerHTML = '';
        const selectedNodeSet = getSelectedNodeSet();

        const categorizedOptions = this.categorizeOptions();

        if (categorizedOptions.general) {
            this.addLabel('Actions:');
            categorizedOptions.general.forEach(option => this.addOptionToMenu(option));
        }

        if (!selectedNodeSet.isEmpty() && categorizedOptions.node) {
            this.addLabel('Highlighted node actions:');
            categorizedOptions.node.forEach(option => this.addOptionToMenu(option, selectedNodeSet));
        }

        if (!this.menuElement.innerHTML.trim()) return;

        this.menuElement.style.left = `${x}px`;
        this.menuElement.style.top = `${y}px`;
        this.menuElement.style.display = 'block';

        const menuRect = this.menuElement.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let finalX = x;
        let finalY = y;

        // If menu overflows to the right → align to left
        if (x + menuRect.width > screenWidth) {
            finalX = x - menuRect.width;
        }

        // If menu overflows bottom → align to top
        if (y + menuRect.height > screenHeight) {
            finalY = y - menuRect.height;
        }

        // Apply final position
        this.menuElement.style.left = `${finalX}px`;
        this.menuElement.style.top = `${finalY}px`;
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
