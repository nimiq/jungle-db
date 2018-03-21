if (typeof(require) !== 'undefined') {
    Benchmark = require('./Benchmark.js');
    BenchmarkUtils = require('./BenchmarkUtils.js');
}

class BenchmarkFill extends Benchmark {
    /**
     * A Benchmark where the database gets filled with random data.
     * @param entryCount
     * @param entrySize
     * @param batchSize - how many entries to write within one transaction
     * @param useRandomKeys - whether to use random strings as keys or sequential numbers
     * @param sync - Whether the data within one transaction should be written sync or async
     */
    constructor({ entryCount, entrySize, batchSize, useRandomKeys, sync }) {
        if (batchSize>entryCount
            || (batchSize===1 && !sync)) { // we ignore this setting as it is the same as batchSize 1 with sync
            throw('Illegal parameter combination.');
        }
        super(BenchmarkFill.NAME, BenchmarkFill.VERSION, [BenchmarkFill.TABLE_NAME]);
        this._entrySize = entrySize;
        this._entryCount = entryCount;
        this._batchSize = batchSize;
        this._useRandomKeys = useRandomKeys;
        this._sync = sync;
        this.description = `${BenchmarkFill.NAME},${entryCount} entries,${entrySize} B/entry,`
            + `${batchSize} ops/tx,${useRandomKeys? 'random' : 'sequential'} keys,`
            + `${this._sync? '' : 'a'}sync`;
    }

    async _reset() {
        // not calling this._db.destroy like in _finalCleanup because of
        // https://github.com/nimiq-network/jungle-db/issues/1
        const promises = [];
        for (const objectStore of this._objectStores) {
            promises.push(objectStore.truncate());
        }
        await Promise.all(promises);
    }

    async _benchmark(stats) {
        const objectStore = this._db.getObjectStore(BenchmarkFill.TABLE_NAME);
        const keys = this._useRandomKeys? BenchmarkUtils.createRandomKeys(this._entryCount) : null;
        await BenchmarkUtils.fillObjectStore(objectStore, this._entryCount, this._entrySize, this._batchSize,
            this._sync, keys, stats);
    }
}
BenchmarkFill.NAME = 'benchmark-fill';
BenchmarkFill.TABLE_NAME = 'default';
BenchmarkFill.VERSION = 1;

if (typeof(module) !== 'undefined') {
    module.exports = BenchmarkFill;
}
