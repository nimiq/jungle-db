/**
 * @typedef {object} ObjectStoreConfig
 * @property {ICodec} [codec]
 * @property {boolean} [persistent]
 * @property {boolean} [enableLruCache] Enables a LRU cache.
 * @property {number} [lruCacheSize] The maximum number of values stored in the cache (default: 5000)
 * @property {number} [rawLruCacheSize] The maximum number of raw values stored in the cache (default: 0).
 * @property {boolean|function(oldVersion:number, newVersion:number):boolean} [upgradeCondition]
 * @property {ILMDBEncoding|ILevelDBEncoding} [keyEncoding]
 * @property {ILMDBEncoding} [lmdbKeyEncoding]
 * @property {ILevelDBEncoding} [leveldbKeyEncoding]
 */


/**
 * @typedef {object} IndexConfig
 * @property {boolean} [multiEntry] default: false
 * @property {boolean} [unique] default: false
 * @property {boolean|function(oldVersion:number, newVersion:number):boolean} [upgradeCondition]
 * @property {ILMDBEncoding|ILevelDBEncoding} [keyEncoding]
 * @property {ILMDBEncoding} [lmdbKeyEncoding]
 * @property {ILevelDBEncoding} [leveldbKeyEncoding]
 */

/**
 * @typedef {object} RetrievalConfig
 * @property {boolean} [raw] default: false
 */

/**
 * @typedef {object} SyncRetrievalConfig
 * @property {boolean} [raw] Raw retrieval without decoding (default: false).
 * @property {boolean} [expectPresence] Method throws an error if key is not available by synchronous retrieval (default: true).
 */
