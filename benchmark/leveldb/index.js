process.on('uncaughtException', function(err){
    console.error(err.stack);
    process.exit();
});

const JDB = require('../../dist/leveldb.js');
const BenchmarkRunner = require('../shared/BenchmarkRunner.js');

BenchmarkRunner.runBenchmarks(undefined, JDB).then(() => console.log('\nBenchmarks finished.'));
