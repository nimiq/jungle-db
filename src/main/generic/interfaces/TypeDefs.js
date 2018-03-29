/**
 * @typedef {object} ObjectStoreConfig
 * @property {ICodec} [codec]
 * @property {boolean} [persistent]
 * @property {boolean} [enableLRUCache]
 * @property {boolean|function(oldVersion:number, newVersion:number):boolean} [upgradeCondition]
 * @property {ILMDBEncoding|ILevelDBEncoding} [keyEncoding]
 * @property {ILMDBEncoding} [lmdbKeyEncoding]
 * @property {ILevelDBEncoding} [leveldbKeyEncoding]
 */


/**
 * @typedef {object} IndexConfig
 * @property {boolean} [multiEntry]
 * @property {boolean} [unique]
 * @property {boolean|function(oldVersion:number, newVersion:number):boolean} [upgradeCondition]
 * @property {ILMDBEncoding|ILevelDBEncoding} [keyEncoding]
 * @property {ILMDBEncoding} [lmdbKeyEncoding]
 * @property {ILevelDBEncoding} [leveldbKeyEncoding]
 */

