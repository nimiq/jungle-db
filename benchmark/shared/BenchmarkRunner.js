if (typeof(require) !== 'undefined') {
    BenchmarkFill = require('./BenchmarkFill.js');
    BenchmarkOverwrite = require('./BenchmarkOverwrite.js');
    BenchmarkRead = require('./BenchmarkRead.js');
    BenchmarkDelete = require('./BenchmarkDelete.js');
    BenchmarkReadFromMultiple = require('./BenchmarkReadFromMultiple.js');
}

class BenchmarkRunner {
    static async runBenchmarks(benchmarkUi = null) {
        if (benchmarkUi) {
            for (const benchmarkDescription of BenchmarkRunner.BenchmarkDescriptions) {
                const type = benchmarkDescription.benchmark.NAME;
                const keys = Object.keys(benchmarkDescription).filter(key => key !== 'benchmark');
                benchmarkUi.addBenchmarkType(type, benchmarkDescription, keys);
            }
        }
        for (const benchmarkDescription of BenchmarkRunner.BenchmarkDescriptions) {
            // evaluate all combinations of params
            const type = benchmarkDescription.benchmark.NAME;
            const keys = Object.keys(benchmarkDescription).filter(key => key !== 'benchmark');
            const combinationCount = BenchmarkRunner._getCombinationsCount(benchmarkDescription, keys);
            for (let i=0; i<combinationCount; ++i) {
                const params = BenchmarkRunner.indexToParameters(benchmarkDescription, keys, i);
                let result;
                try {
                    const benchmark = new benchmarkDescription.benchmark(params);
                    result = await benchmark.run(); // eslint-disable-line no-await-in-loop
                } catch(e) {
                    console.log('\nSkipped invalid configuration', params, 'because of error', e);
                    result = null;
                }
                if (benchmarkUi) {
                    benchmarkUi.addBenchmarkResult(type, result);
                }
            }
        }
    }

    /**
     * Get the index a specific parameter setting has in the enumeration of all possible parameter combinations
     * for a benchmarkDescription.
     * @param {object} benchmarkDescription
     * @param {Array.<string>} keys
     * @param {object} params
     * @returns {number}
     */
    static parametersToIndex(benchmarkDescription, keys, params) {
        // this is like counting up numbers, e.g. 1234 = ((1 * 10 + 2) * 10 + 3) * 10 + 4
        // Just that the factor is not necessarily 10 and can differ at each position.
        let index = 0;
        for (let i=0; i<keys.length; ++i) {
            const key = keys[i];
            const possibleValues = benchmarkDescription[key];
            const value = params[key];
            const valuePosition = possibleValues.indexOf(value);
            if (valuePosition === -1) {
                return -1; // this parameter setting does not come from the BenchmarkDescriptions
            }
            const factor = possibleValues.length;
            index = index * factor + valuePosition;
        }
        return index;
    }

    /**
     * Get the parameter setting with a given index in the enumeration of all possible parameter combinations
     * for a benchmarkDescription.
     * @param {object} benchmarkDescription
     * @param {Array.<string>} keys
     * @param {number} index
     * @returns {object}
     */
    static indexToParameters(benchmarkDescription, keys, index) {
        const params = {};
        for (let i=keys.length-1; i>=0; --i) {
            const key = keys[i];
            const possibleValues = benchmarkDescription[key];
            const factor = possibleValues.length;
            const valuePosition = index % factor;
            params[key] = possibleValues[valuePosition];
            index = Math.floor(index / factor);
        }
        return params;
    }

    /**
     * @param {object} benchmarkDescription
     * @param {Array.<string>} keys
     * @returns {number}
     */
    static _getCombinationsCount(benchmarkDescription, keys) {
        let count = 1;
        for (const key of keys) {
            count *= benchmarkDescription[key].length;
        }
        return count;
    }
}
BenchmarkRunner.BenchmarkDescriptions = [
    {
        benchmark: BenchmarkFill,
        entryCount: [100, 500, 1000, 10000],
        entrySize: [100, 1000, 100000],
        batchSize: [1, 100, 500],
        sync: [true, false]
    },
    {
        benchmark: BenchmarkOverwrite,
        databaseEntryCount: [10000, 10000],
        overwriteCount: [1000, 10000],
        entrySize: [10, 100, 1000],
        batchSize: [1, 10, 100, 1000],
        sync: [true, false]
    },
    {
        benchmark: BenchmarkRead,
        databaseEntryCount: [100, 500, 1000],
        readCount: [10, 100, 1000],
        entrySize: [100, 1000, 1000000],
        batchSize: [1, 10, 100],
        sync: [true, false]
    },
    {
        benchmark: BenchmarkDelete,
        databaseEntryCount: [100, 500, 1000],
        deleteCount: [10, 100, 1000],
        entrySize: [100, 1000],
        batchSize: [1, 10, 100],
        sync: [true, false]
    },
    {
        benchmark: BenchmarkReadFromMultiple,
        databaseEntryCount: [100, 500, 1000],
        readCount: [10, 100, 1000],
        totalEntrySize: [100, 1000],
        numberTables: [1, 2, 3],
        batchSize: [1, 10, 100],
        sync: [true, false]
    }
];

if (typeof(module) !== 'undefined') {
    module.exports = BenchmarkRunner;
}
