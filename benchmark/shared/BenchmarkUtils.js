if (typeof(require) !== 'undefined') {
    RandomGenerator = require('./RandomGenerator.js');
    Timer = require('./Timer.js');
}

class BenchmarkUtils {
    /**
     * @param {ObjectStore} objectStore
     * @param {number} entryCount
     * @param {number} entrySize
     * @param {number} [batchSize]
     * @param {boolean} [sync]
     * @param {Array.<string>} [keys]
     * @param {Stats} [stats]
     * @returns {Promise.<void>}
     */
    static async fillObjectStore(objectStore, entryCount, entrySize, batchSize=1, sync=false, keys=null, stats=null) {
        const randomData = [];
        for (let i=0; i<entryCount; ++i) {
            randomData.push(RandomGenerator.generateRandomData(entrySize));
        }
        const putEntry = async (transaction, index) => {
            const key = keys? keys[index] : String(index);
            const data = randomData[index];
            await transaction.put(key, data);
        };
        const totalTime =
            (await BenchmarkUtils.performBatchOperation(objectStore, entryCount, batchSize, sync, putEntry)).totalTime;
        if (stats) {
            stats.addWrites(entryCount, entryCount*entrySize, totalTime);
        }
    }


    /**
     * @param {ObjectStore} objectStore
     * @param {number} entryCount
     * @param {number} entrySize
     * @param {number} [batchSize]
     * @param {boolean} [sync]
     * @param {Array.<string>} [keys]
     * @param {Array.<string>} [indexKeys]
     * @param {Stats} [stats]
     * @returns {Promise.<void>}
     */
    static async fillObjectStoreWithIndex(objectStore, entryCount, entrySize, batchSize=1, sync=false, keys=null, indexKeys=null, stats=null) {
        const randomData = [];
        for (let i=0; i<entryCount; ++i) {
            randomData.push({
                index: indexKeys ? indexKeys[i] : String(i),
                data: RandomGenerator.generateRandomData(entrySize)
            });
        }
        const putEntry = async (transaction, index) => {
            const key = keys ? keys[index] : String(index);
            const data = randomData[index];
            await transaction.put(key, data);
        };
        const totalTime =
            (await BenchmarkUtils.performBatchOperation(objectStore, entryCount, batchSize, sync, putEntry)).totalTime;
        if (stats) {
            stats.addWrites(entryCount, entryCount*entrySize, totalTime);
        }
    }


    /**
     * @param {ObjectStore} objectStore
     * @param {number} totalCount
     * @param {number} batchSize
     * @param {boolean} sync
     * @param {function} operation
     * @returns {Promise.<{results: Array, totalTime: number}>}
     */
    static async performBatchOperation(objectStore, totalCount, batchSize, sync, operation) {
        let startTime = 0;
        let totalTime = 0;
        let index = 0;
        let results = [];
        while (index < totalCount) {
            startTime = Timer.currentTimeMillis();
            const transaction = objectStore.transaction();
            totalTime += Timer.elapsedMillis(startTime);
            const asyncPromises = [];
            const currentBatchSize = Math.min(batchSize, totalCount-index);
            if (!sync) {
                startTime = Timer.currentTimeMillis();
            }
            for (let i = 0; i < currentBatchSize; ++i) {
                if (sync) {
                    startTime = Timer.currentTimeMillis();
                    results.push(await operation(transaction, index)); // eslint-disable-line no-await-in-loop
                    totalTime += Timer.elapsedMillis(startTime);
                } else {
                    asyncPromises.push(operation(transaction, index));
                }
                index++;
            }
            let success;
            if (sync) {
                startTime = Timer.currentTimeMillis();
                success = await transaction.commit(); // eslint-disable-line no-await-in-loop
                totalTime += Timer.elapsedMillis(startTime);
            } else {
                results = await Promise.all(asyncPromises); // eslint-disable-line no-await-in-loop
                success = await transaction.commit(); // eslint-disable-line no-await-in-loop
                totalTime += Timer.elapsedMillis(startTime);
            }
            if (!success) {
                console.warn('Transaction couldn\'t be committed.');
            }
        }
        return {
            results: results,
            totalTime: totalTime
        };
    }

    /**
     * @param {Array.<ObjectStore>} objectStores
     * @param {number} totalCount
     * @param {number} batchSize
     * @param {boolean} sync
     * @param {function} operation
     * @returns {Promise.<{results: Array, totalTime: number}>}
     */
    static async performBatchOperations(objectStores, totalCount, batchSize, sync, operation) {
        let startTime = 0;
        let totalTime = 0;
        let index = 0;
        let results = [];
        while (index < totalCount) {
            const transactions = [];
            for (const objectStore of objectStores) {
                startTime = Timer.currentTimeMillis();
                transactions.push(objectStore.transaction());
                totalTime += Timer.elapsedMillis(startTime);
            }
            const asyncPromises = [];
            const currentBatchSize = Math.min(batchSize, totalCount-index);
            if (!sync) {
                startTime = Timer.currentTimeMillis();
            }
            for (let i = 0; i < currentBatchSize; ++i) {
                if (sync) {
                    startTime = Timer.currentTimeMillis();
                    results.push(await operation(transactions, index)); // eslint-disable-line no-await-in-loop
                    totalTime += Timer.elapsedMillis(startTime);
                } else {
                    asyncPromises.push(operation(transactions, index));
                }
                index++;
            }
            let success = true;
            if (sync) {
                for (const transaction of transactions) {
                    startTime = Timer.currentTimeMillis();
                    success = await transaction.commit() && success; // eslint-disable-line no-await-in-loop
                    totalTime += Timer.elapsedMillis(startTime);
                }
            } else {
                for (const transaction of transactions) {
                    results = await Promise.all(asyncPromises); // eslint-disable-line no-await-in-loop
                    success = await transaction.commit() && success; // eslint-disable-line no-await-in-loop
                    totalTime += Timer.elapsedMillis(startTime);
                }
            }
            if (!success) {
                console.warn('Transaction couldn\'t be committed.');
            }
        }
        return {
            results: results,
            totalTime: totalTime
        };
    }


    /**
     * @param count
     * @returns {Array.<string>}
     */
    static createRandomKeys(count) {
        const result = [];
        for (let i=0; i<count; ++i) {
            result.push(RandomGenerator.generateRandomString());
        }
        return result;
    }


    static logColored(str) {
        if (typeof(window) !== 'undefined') {
            // browser
            console.log(`%c${str}`, 'color: teal; font-weight: bold;');
        } else {
            // node
            // console.log('\x1b[36m%s\x1b[0m', str);
            console.log(str);
        }
    }
}

if (typeof(module) !== 'undefined') {
    module.exports = BenchmarkUtils;
}
