// Karma configuration
// Generated on Tue May 09 2017 23:26:08 GMT+0200 (CEST)

module.exports = function (config) {
    const configuration = {

        // base path that will be used to resolve all patterns (eg. files, exclude)
        basePath: '',


        // frameworks to use
        // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
        frameworks: ['jasmine'],


        // list of files / patterns to load in the browser
        files: [
            'src/test/backend/indexeddb/spec.js',
            'dist/indexeddb.js',
            'src/test/**/UnsynchronousBackend.js',
            'src/test/**/TestRunner.js',
            'src/test/generic/TestCodec.js',
            'src/test/backend/indexeddb/BinaryCodec.js',
            'src/test/generic/**/*.spec.js',
            'src/test/backend/indexeddb/**/*.spec.js'
        ],


        // list of files to exclude
        exclude: [],


        // preprocess matching files before serving them to the browser
        // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
        preprocessors: {},


        // test results reporter to use
        // possible values: 'dots', 'progress'
        // available reporters: https://npmjs.org/browse/keyword/karma-reporter
        reporters: ['progress'],


        // web server port
        port: 9876,


        // enable / disable colors in the output (reporters and logs)
        colors: true,


        // level of logging
        // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
        logLevel: config.LOG_INFO,


        // enable / disable watching file and executing tests whenever any file changes
        autoWatch: true,


        // start these browsers
        // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
        browsers: ['Chrome'],


        // Continuous Integration mode
        // if true, Karma captures browsers, runs the tests and exits
        singleRun: true,

        // Concurrency level
        // how many browser should be started simultaneous
        concurrency: 1,

        browserNoActivityTimeout: 120000
    };

    if (process.env.USE_BABEL) {
        configuration.files[1] = 'dist/indexeddb-babel.js';
    }
    if (process.env.USE_ISTANBUL) {
        configuration.files[1] = 'dist/indexeddb-istanbul.js';
        configuration.reporters.push('coverage');
        configuration.coverageReporter = {
            reporters: [
                {type:'html', subdir: '.'},
                {type:'lcovonly', subdir: '.'},
                {type:'json', subdir: '.'}
            ]
        };
    }
    if (process.env.KARMA_BROWSERS) {
        configuration.browsers = process.env.KARMA_BROWSERS.split(',');
    }
    config.set(configuration);
};
