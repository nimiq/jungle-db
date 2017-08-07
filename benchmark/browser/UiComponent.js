class UiComponent {
    constructor(el = null) {
        this.el = el || document.createElement('div');
        this._name = this.constructor.name;
        this.el.setAttribute('is', this._name);
        this._ = {};
    }

    _init() {
        this._initStyle();
        this._initDom();
        this._setScope();
    }

    _initDom() {}

    _setScope(el) {
        el = el || this.el;
        if (el.hasAttribute('scope')) {
            return;
        }
        el.setAttribute('scope', this._name);
        for (let i=0; i<el.children.length; ++i) {
            this._setScope(el.children[i]);
        }
    }

    _initStyle(styleContent) {
        if (!styleContent) {
            return null;
        }
        const id = `style-${this._name}`;
        if (document.getElementById(id)) {
            return null;
        }
        const style = document.createElement('style');
        style.setAttribute('id', id);
        style.textContent = styleContent;
        document.head.appendChild(style);
        return style;
    }
}
