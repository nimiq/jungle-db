class BenchmarkUi extends UiComponent {
    constructor(el = null) {
        super(el);
        this._benchmarkSelector = null;
        this._selectedBenchmark = null;
        this._benchmarkViews = {};
        this._init();
    }

    _initDom() {
        this._benchmarkSelector = new SelectorBar('Benchmark');
        this._benchmarkSelector.onSelected(benchmark => {
            if (this._selectedBenchmark) {
                this._benchmarkViews[this._selectedBenchmark].hide();
            }
            this._benchmarkViews[benchmark].show();
            this._selectedBenchmark = benchmark;
        });
        this.el.appendChild(this._benchmarkSelector.el);
    }

    addBenchmarkType(type, benchmarkDescription, parameterKeys) {
        this._benchmarkSelector.addOption(type);
        const benchmarkView = new BenchmarkView(benchmarkDescription, parameterKeys);
        this._benchmarkViews[type] = benchmarkView;
        benchmarkView.hide();
        this.el.appendChild(benchmarkView.el);
        if (!this._selectedBenchmark) {
            this._benchmarkSelector.select(type);
        }
    }

    addBenchmarkResult(type, result) {
        this._benchmarkViews[type].addBenchmarkResult(result);
    }
}
