const JDB = require('../../../../dist/node.js');
for(let i in JDB) global[i] = JDB[i];
global.JDB = JDB;

global.Class = {
    register: clazz => {
        global[clazz.prototype.constructor.name] = clazz;
    }
};

require('../../generic/DummyBackend.js');
require('./BinaryCodec.js');
require('../../generic/TestCodec.js');
