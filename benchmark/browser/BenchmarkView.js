class BenchmarkView extends UiComponent {
    constructor(benchmarkDescription, keys, el = null) {
        super(el);
        this._results = [];
        this._benchmarkDescription = benchmarkDescription;
        this._keys = keys;
        this._currentParams = {};
        this._selectorBars = {};
        this._initialized = false;
        this._init();
    }

    _init() {
        super._init();
        for (const key of this._keys) {
            this._selectorBars[key].select(this._benchmarkDescription[key][0]);
        }
        this._initialized = true;
        this._showSelectedBenchmark();
    }

    _initDom() {
        for (const key of this._keys) {
            const selectorBar = new SelectorBar(key);
            for (const option of this._benchmarkDescription[key]) {
                selectorBar.addOption(option);
            }
            selectorBar.onSelected(option => {
                this._currentParams[key] = option;
                this._showSelectedBenchmark();
            });
            this._selectorBars[key] = selectorBar;
            this.el.appendChild(selectorBar.el);
        }
        this._.benchmarkResult = document.createElement('div');
        this._.benchmarkResult.classList.add('benchmark-result');
        this.el.appendChild(this._.benchmarkResult);
    }

    _initStyle() {
        const container = `[is="${this._name}"]`;
        const scope = `[scope="${this._name}"]`;
        super._initStyle(`
            ${scope}${container} {
                border-top: 1px solid #aaa;
            }
            
            ${scope}.benchmark-result {
                padding-top: 16px;
            }
        `);
    }

    addBenchmarkResult(result) {
        this._results.push(result);
        this._showSelectedBenchmark(); // update the selected benchmark for the case that its the one we just got
    }

    show() {
        this.el.style.display = 'block';
    }

    hide() {
        this.el.style.display = 'none';
    }

    _showSelectedBenchmark() {
        if (!this._initialized) {
            return;
        }
        const index = BenchmarkRunner.parametersToIndex(this._benchmarkDescription, this._keys, this._currentParams);
        const result = this._results[index];
        if (result === undefined) {
            this._.benchmarkResult.textContent = 'Benchmark not finished yet.';
        } else if (result === null) {
            this._.benchmarkResult.textContent = 'This is not a valid parameter combination.';
        } else {
            this._.benchmarkResult.textContent = result.toString();
        }
    }
}
