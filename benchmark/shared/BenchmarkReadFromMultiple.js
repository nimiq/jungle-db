if (typeof(require) !== 'undefined') {
    Benchmark = require('./Benchmark.js');
    BenchmarkUtils = require('./BenchmarkUtils.js');
    RandomGenerator = require('./RandomGenerator.js');
}

class BenchmarkReadFromMultiple extends Benchmark {
    /**
     * A Benchmark where random, already existing database entries get read.
     * @param databaseEntryCount
     * @param readCount
     * @param entrySize
     * @param batchSize
     * @param sync
     */
    constructor({ databaseEntryCount, readCount, totalEntrySize, numberTables, batchSize, sync }) {
        if (readCount>databaseEntryCount || batchSize>databaseEntryCount
            || (batchSize===1 && !sync)) { // we ignore this setting as it is the same as batchSize 1 with sync
            throw('Illegal parameter combination.');
        }
        const tableNames = [];
        for (let i = 0; i < numberTables; ++i) {
            tableNames.push(`${BenchmarkReadFromMultiple.BASE_TABLE_NAME}${i}`);
        }
        super(BenchmarkReadFromMultiple.NAME, BenchmarkReadFromMultiple.VERSION, tableNames);
        this._databaseEntryCount = databaseEntryCount;
        this._readCount = readCount;
        this._entrySize = Math.ceil(totalEntrySize / numberTables);
        this._numberTables = numberTables;
        this._batchSize = batchSize;
        this._sync = sync;
        this._entryKeys = BenchmarkUtils.createRandomKeys(databaseEntryCount);
        this.description = `${BenchmarkReadFromMultiple.NAME}, ${databaseEntryCount} entries in database, `
            + `read ${readCount} entries, ${totalEntrySize} Bytes per entry, ${numberTables} tables, batch size ${batchSize}, `
            + `${this._sync? '' : 'a'}sync`;
    }


    async _init() {
        await super._init();
        const promises = [];
        // fill up the database
        for (let i = 0; i < this._numberTables; ++i) {
            const objectStore = this._db.getObjectStore(this._tableNames[i]);
            promises.push(BenchmarkUtils.fillObjectStore(objectStore, this._databaseEntryCount, this._entrySize, 1000, false,
                this._entryKeys));
        }
        return Promise.all(promises);
    }


    async _benchmark(stats) {
        const readKeys = [];
        for (let i=0; i<this._readCount; ++i) {
            readKeys.push(RandomGenerator.getRandomEntry(this._entryKeys));
        }
        const readOperation = (transactions, index) => {
            const key = readKeys[index];
            const results = [];
            for (const transaction of transactions) {
                results.push(transaction.get(key));
            }
            return Promise.all(results);
        };
        const objectStores = [];
        for (let i = 0; i < this._numberTables; ++i) {
            objectStores.push(this._db.getObjectStore(this._tableNames[i]));
        }
        const result = await BenchmarkUtils.performBatchOperations(objectStores, this._readCount, this._batchSize,
            this._sync, readOperation);
        if (!result.results.every(entry => !!entry)) {
            console.error('Error reading data from database.');
        }
        stats.addReads(this._readCount, this._readCount * this._entrySize * this._numberTables, result.totalTime);
    }
}
BenchmarkReadFromMultiple.NAME = 'benchmark-read-from-multiple';
BenchmarkReadFromMultiple.BASE_TABLE_NAME = 'table';
BenchmarkReadFromMultiple.VERSION = 1;

if (typeof(module) !== 'undefined') {
    module.exports = BenchmarkReadFromMultiple;
}
