/**
 * This interface represents a low level encoding for LMDB.
 * @interface
 * @implements {IBasicEncoding}
 */
class ILMDBEncoding extends IBasicEncoding {
    /**
     * This encoding determines the type of put/get operation used.
     * @type {JungleDB.Encoding}
     */
    get encoding() {}
}
