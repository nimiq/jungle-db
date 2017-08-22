process.on('uncaughtException', function(err){
    console.error(err.stack);
    process.exit();
});

const BenchmarkRunner = require('../shared/BenchmarkRunner.js');

BenchmarkRunner.runBenchmarks().then(() => console.log('\nBenchmarks finished.'));
