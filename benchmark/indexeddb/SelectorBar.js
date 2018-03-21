class SelectorBar extends UiComponent {
    constructor(description, el = null) {
        super(el);
        this._description = description;
        this._listeners = [];
        this._options = new Map(); // option -> optionEl
        this._.selectedOption = null;
        this._init();
    }


    _initDom() {
        this._.description = document.createElement('div');
        this._.description.textContent = this._description;
        this._.description.classList.add('description');
        this.el.appendChild(this._.description);
        this._.options = document.createElement('div');
        this._.options.classList.add('options');
        this.el.appendChild(this._.options);
    }


    _initStyle() {
        const container = `[is="${this._name}"]`;
        const scope = `[scope="${this._name}"]`;
        super._initStyle(`
            ${scope}${container} {
                display: flex;
                padding: 8px 0;
            }
            
            ${scope}.description {
                width: 200px;
                font-weight: bold;
            }
            
            ${scope}.options {
                flex-grow: 1;
                display: flex;
                justify-content: space-between;
            }
            
            ${scope}.options > ${scope} {
                color: blue;
                cursor: pointer;
            }
            
            ${scope}.options > ${scope}.selected {
                text-decoration: underline;
            }
        `);
    }

    get options() {
        return Array.from(this._options.keys());
    }

    addOption(option) {
        if (this._options.has(option)) {
            return;
        }
        const optionEl = document.createElement('div');
        optionEl.textContent = option;
        optionEl.addEventListener('click', () => this.select(option));
        this._setScope(optionEl);
        this._.options.appendChild(optionEl);
        this._options.set(option, optionEl);
    }

    select(option) {
        if (!this._options.has(option)) {
            throw Error(`Unknown option ${option} for ${this._description}`);
        }
        if (this._.selectedOption) {
            this._.selectedOption.classList.remove('selected');
        }
        this._.selectedOption = this._options.get(option);
        this._.selectedOption.classList.add('selected');
        this._listeners.forEach(listener => listener(option));
    }

    onSelected(listener) {
        this._listeners.push(listener);
    }
}
