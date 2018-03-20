/**
 * Utils that are related to common JavaScript objects.
 */
class ObjectUtils {
    /**
     * This method returns the value of an object at a given path.
     * A key path is defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * @param {Object} obj The JS object to access.
     * @param {string|Array.<string>} path The key path to access.
     * @returns {*} The value at the given path or undefined if the path does not exist.
     */
    static byKeyPath(obj, path) {
        if (!Array.isArray(path)) {
            return obj[path];
        }
        let tmp = obj;
        for (const component of path) {
            if (tmp === undefined) {
                return undefined;
            }
            tmp = tmp[component];
        }
        return tmp;
    }
}
Class.register(ObjectUtils);
