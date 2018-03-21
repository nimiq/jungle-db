module.exports = {};

const atob = require('atob');
const btoa = require('btoa');

const Class = {
    register: clazz => {
        module.exports[clazz.prototype.constructor.name] = clazz;
    }
};
