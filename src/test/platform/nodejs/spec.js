global.JDB = {};

global.Class = {
    register: clazz => {
        global.JDB[clazz.prototype.constructor.name] = clazz;
        global[clazz.prototype.constructor.name] = clazz;
    }
};

global.JDB.Class = global.Class;

process.on('unhandledRejection', console.error);

require('../../generic/DummyBackend.js');
require('../../generic/TestCodec.js');
require('../../platform/nodejs/BinaryCodec.js');

require('../../../main/generic/utils/BTree.js');
require('../../../main/generic/utils/LRUMap.js');
require('../../../main/generic/utils/ObjectUtils.js');
require('../../../main/generic/utils/Observable.js');
require('../../../main/generic/utils/Synchronizer.js');
require('../../../main/generic/utils/SetUtils.js');
require('../../../main/generic/CachedBackend.js');
require('../../../main/generic/InMemoryIndex.js');
require('../../../main/generic/InMemoryBackend.js');
require('../../../main/generic/KeyRange.js');
require('../../../main/generic/ObjectStore.js');
require('../../../main/generic/Query.js');
require('../../../main/generic/TransactionIndex.js');
require('../../../main/generic/Transaction.js');
require('../../../main/generic/CombinedTransaction.js');

require('../../../main/platform/nodejs/utils/LevelDBTools.js');
require('../../../main/platform/nodejs/utils/IndexCodec.js');
require('../../../main/platform/nodejs/PersistentIndex.js');
require('../../../main/platform/nodejs/LevelDBBackend.js');
require('../../../main/platform/nodejs/JungleDB.js');
