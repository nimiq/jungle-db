module.exports = {};

const Class = {
    register: clazz => {
        module.exports[clazz.prototype.constructor.name] = clazz;
    }
};
