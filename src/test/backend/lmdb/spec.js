process.on('uncaughtException', function(err){
    console.error(err.stack);
    process.exit();
});

const JDB = require('../../../../dist/lmdb.js');

for(let i in JDB) global[i] = JDB[i];
global.JDB = JDB;

global.Class = {
    register: clazz => {
        global[clazz.prototype.constructor.name] = clazz;
    }
};

require('./BinaryCodec.js');
require('../../generic/TestCodec.js');
