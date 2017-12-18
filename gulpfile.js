const gulp = require('gulp');
const babel = require('gulp-babel');
const browserify = require('browserify');
const buffer = require('vinyl-buffer');
const concat = require('gulp-concat');
const connect = require('gulp-connect');
const jasmine = require('gulp-jasmine-livereload-task');
const merge = require('merge2');
const source = require('vinyl-source-stream');
const sourcemaps = require('gulp-sourcemaps');
const uglify = require('gulp-uglify-es').default;
const util = require('gulp-util');
const istanbul = require('istanbul-api');

const sources = {
    platform: {
        browser: [
            './src/main/platform/browser/Class.js',
            './src/main/platform/browser/utils/IDBTools.js',
            './src/main/platform/browser/utils/LogNative.js',
            './src/main/platform/browser/EncodedTransaction.js',
            './src/main/platform/browser/IDBBackend.js',
            './src/main/platform/browser/JungleDB.js',
            './src/main/platform/browser/PersistentIndex.js'
        ],
        node: [
            './src/main/platform/nodejs/utils/IndexCodec.js',
            './src/main/platform/nodejs/utils/LevelDBTools.js',
            './src/main/platform/nodejs/utils/LogNative.js',
            './src/main/platform/nodejs/LevelDBBackend.js',
            './src/main/platform/nodejs/JungleDB.js',
            './src/main/platform/nodejs/PersistentIndex.js'
        ]
    },
    generic: [
        './src/main/generic/utils/ArrayUtils.js',
        './src/main/generic/utils/BTree.js',
        './src/main/generic/utils/BufferUtils.js',
        './src/main/generic/utils/JSONUtils.js',
        './src/main/generic/utils/Log.js',
        './src/main/generic/utils/LRUMap.js',
        './src/main/generic/utils/ObjectUtils.js',
        './src/main/generic/utils/Observable.js',
        './src/main/generic/utils/SetUtils.js',
        './src/main/generic/utils/Synchronizer.js',
        './src/main/generic/CachedBackend.js',
        './src/main/generic/InMemoryIndex.js',
        './src/main/generic/InMemoryBackend.js',
        './src/main/generic/KeyRange.js',
        './src/main/generic/ObjectStore.js',
        './src/main/generic/Query.js',
        './src/main/generic/TransactionIndex.js',
        './src/main/generic/Transaction.js',
        './src/main/generic/Snapshot.js',
        './src/main/generic/SnapshotManager.js',
        './src/main/generic/CombinedTransaction.js'
    ],
    test: {
        generic: [
            './src/test/generic/DummyBackend.js',
            './src/test/generic/**/*.spec.js'
        ],
        browser: [
            './src/test/generic/TestCodec.js',
            './src/test/platform/browser/BinaryCodec.js',
            './src/test/platform/browser/**/*.spec.js'
        ]
    },
    all: [
        './src/main/**/*.js',
        './src/test/**/*.js',
        '!./src/**/node_modules/**/*.js'
    ]
};

const babel_config = {
    plugins: [['transform-runtime', {
        'polyfill': false
    }], 'transform-es2015-modules-commonjs'],
    presets: ['es2016', 'es2017']
};

const babel_loader = {
    plugins: [['transform-runtime', {
        'polyfill': false
    }]],
    presets: ['env']
};

const uglify_config = {
    ie8: true,
    keep_fnames: true,
    ecma: 8,
    warnings: true,
    mangle: {
        keep_classnames: true,
        safari10: true
    },
    compress: {
        sequences: false,
        typeofs: false,
        keep_infinity: true
    }
};

const uglify_babel = {
    ie8: true,
    keep_fnames: true,
    ecma: 5,
    warnings: true,
    mangle: {
        keep_classnames: true,
        safari10: true
    },
    compress: {
        sequences: false,
        typeofs: false,
        keep_infinity: true
    }
};

gulp.task('build-istanbul', function () {
    return new Promise((callback) => {
        istanbul.instrument.run(istanbul.config.loadObject(), {input: './src/main', output: './.istanbul/src/main'}, callback);
    });
});

const BROWSER_SOURCES = [
    './src/loader/browser/prefix.js.template',
    ...sources.platform.browser,
    ...sources.generic,
    './src/loader/browser/suffix.js.template'
];

gulp.task('build-web-babel', function () {
    return merge(
        browserify([], {
            require: [
                'babel-runtime/core-js/array/from',
                'babel-runtime/core-js/object/values',
                'babel-runtime/core-js/object/freeze',
                'babel-runtime/core-js/object/keys',
                'babel-runtime/core-js/json/stringify',
                'babel-runtime/core-js/number/is-integer',
                'babel-runtime/core-js/number/max-safe-integer',
                'babel-runtime/core-js/math/clz32',
                'babel-runtime/core-js/math/fround',
                'babel-runtime/core-js/math/imul',
                'babel-runtime/core-js/math/trunc',
                'babel-runtime/core-js/promise',
                'babel-runtime/core-js/get-iterator',
                'babel-runtime/regenerator',
                'babel-runtime/helpers/asyncToGenerator'
            ]
        }).bundle()
            .pipe(source('babel.js'))
            .pipe(buffer())
            .pipe(uglify()),
        gulp.src(BROWSER_SOURCES, { base: 'src' })
            .pipe(sourcemaps.init())
            .pipe(concat('web.js'))
            .pipe(babel(babel_config)))
        .pipe(sourcemaps.init())
        .pipe(concat('web-babel.js'))
        .pipe(uglify(uglify_babel))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('build-web', function () {
    return gulp.src(BROWSER_SOURCES, { base: 'src' })
        .pipe(sourcemaps.init())
        .pipe(concat('web.js'))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'))
        .pipe(connect.reload());
});

gulp.task('build-web-istanbul', ['build-istanbul'], function () {
    return gulp.src(BROWSER_SOURCES.map(f => f.indexOf('./src/main') === 0 ? `./.istanbul/${f}` : f), { base: 'src' })
        .pipe(sourcemaps.init({ loadMaps: true }))
        .pipe(concat('web-istanbul.js'))
        //.pipe(uglify(uglify_config))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'))
        .pipe(connect.reload());
});

const NODE_SOURCES = [
    './src/loader/nodejs/index.prefix.js',
    ...sources.generic,
    ...sources.platform.node,
    './src/loader/nodejs/index.suffix.js'
];

gulp.task('build-node', function () {
    return gulp.src(NODE_SOURCES, { base: 'src' })
        .pipe(sourcemaps.init())
        .pipe(concat('node.js'))
        .pipe(uglify(uglify_config))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('build-node-istanbul', ['build-istanbul'], function () {
    return gulp.src(NODE_SOURCES.map(f => `./.istanbul/${f}`))
        .pipe(sourcemaps.init())
        .pipe(concat('node-istanbul.js'))
        .pipe(uglify(uglify_config))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('test', ['watch'], function () {
    gulp.run(jasmine({
        files: ['./src/test/platform/browser/spec.js', 'dist/web.js'].concat(sources.test.generic).concat(sources.test.browser)
    }));
});

gulp.task('eslint', function () {
    const eslint = require('gulp-eslint');
    return gulp.src(sources.all)
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
});

gulp.task('watch', ['build-web'], function () {
    return gulp.watch(sources.all, ['build-web']);
});

gulp.task('build', ['build-web', 'build-web-babel', 'build-web-istanbul', 'build-node', 'build-node-istanbul']);

gulp.task('default', ['build']);
