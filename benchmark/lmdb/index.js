process.on('uncaughtException', function(err){
    console.error(err.stack);
    process.exit();
});

const JDB = require('../../dist/lmdb.js');
const BenchmarkRunner = require('../shared/BenchmarkRunner.js');

BenchmarkRunner.runBenchmarks(undefined, JDB, { maxDbSize: 1024*1024*1024 }).then(() => console.log('\nBenchmarks finished.'));
