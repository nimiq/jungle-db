class ObjectUtils {
    static byKeyPath(obj, path) {
        if (!Array.isArray(path)) {
            return obj[path];
        }
        let tmp = obj;
        for (const component of path) {
            tmp = tmp[component];
        }
        return tmp;
    }
}
Class.register(ObjectUtils);
