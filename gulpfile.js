const gulp = require('gulp');
const babel = require('gulp-babel');
const browserify = require('browserify');
const buffer = require('vinyl-buffer');
const concat = require('gulp-concat');
const istanbul = require('istanbul-api');
const merge = require('merge2');
const source = require('vinyl-source-stream');
const sourcemaps = require('gulp-sourcemaps');
const uglify = require('gulp-uglify-es').default;

const sources = {
    backend: {
        indexeddb: [
            './src/main/platform/browser/Class.js',
            './src/main/platform/browser/utils/LogNative.js',
            './src/main/backend/indexeddb/utils/IDBTools.js',
            './src/main/backend/indexeddb/IDBBackend.js',
            './src/main/backend/indexeddb/JungleDB.js',
            './src/main/backend/indexeddb/PersistentIndex.js'
        ],
        lmdb: [
            './src/main/platform/nodejs/utils/LogNative.js',
            './src/main/backend/lmdb/utils/EncodedLMDBTransaction.js',
            './src/main/backend/lmdb/LMDBBaseBackend.js',
            './src/main/backend/lmdb/LMDBBackend.js',
            './src/main/backend/lmdb/JungleDB.js',
            './src/main/backend/lmdb/PersistentIndex.js'
        ]
    },
    generic: [
        './src/main/generic/utils/ArrayUtils.js',
        './src/main/generic/utils/BTree.js',
        './src/main/generic/utils/BufferUtils.js',
        './src/main/generic/utils/ComparisonUtils.js',
        './src/main/generic/utils/JSONUtils.js',
        './src/main/generic/utils/Log.js',
        './src/main/generic/utils/LinkedList.js',
        './src/main/generic/utils/UniqueLinkedList.js',
        './src/main/generic/utils/LRUMap.js',
        './src/main/generic/utils/ObjectUtils.js',
        './src/main/generic/utils/SetUtils.js',
        './src/main/generic/utils/SortedList.js',
        './src/main/generic/utils/Synchronizer.js',
        './src/main/generic/utils/EncodedTransaction.js',
        './src/main/generic/utils/GenericValueEncoding.js',
        './src/main/generic/CachedBackend.js',
        './src/main/generic/InMemoryIndex.js',
        './src/main/generic/InMemoryBackend.js',
        './src/main/generic/KeyRange.js',
        './src/main/generic/ObjectStore.js',
        './src/main/generic/Query.js',
        './src/main/generic/TransactionIndex.js',
        './src/main/generic/Transaction.js',
        './src/main/generic/SynchronousTransaction.js',
        './src/main/generic/Snapshot.js',
        './src/main/generic/SnapshotManager.js',
        './src/main/generic/CombinedTransaction.js'
    ],
    test: {
        generic: [
            './src/test/generic/UnsynchronousBackend.js',
            './src/test/generic/TestRunner.js',
            './src/test/generic/**/*.spec.js'
        ],
        indexeddb: [
            './src/test/generic/TestCodec.js',
            './src/test/backend/indexeddb/BinaryCodec.js',
            './src/test/backend/indexeddb/**/*.spec.js'
        ]
    },
    all: [
        './src/main/**/*.js',
        './src/test/**/*.js',
        '!./src/**/node_modules/**/*.js'
    ]
};

const babel_config = {
    plugins: ['@babel/transform-runtime', '@babel/plugin-transform-modules-commonjs'],
    presets: ['@babel/env']
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
    output: {
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

const INDEXEDDB_SOURCES = [
    './src/loader/browser/prefix.js.template',
    ...sources.backend.indexeddb,
    ...sources.generic,
    './src/loader/browser/suffix.js.template'
];

gulp.task('build-indexeddb-babel', function () {
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
        gulp.src(INDEXEDDB_SOURCES, { base: 'src' })
            .pipe(sourcemaps.init())
            .pipe(concat('indexeddb.js'))
            .pipe(babel(babel_config)))
        .pipe(sourcemaps.init())
        .pipe(concat('indexeddb-babel.js'))
        .pipe(uglify(uglify_babel))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('build-indexeddb', function () {
    return gulp.src(INDEXEDDB_SOURCES, { base: 'src' })
        .pipe(sourcemaps.init())
        .pipe(concat('indexeddb.js'))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('build-indexeddb-istanbul', gulp.series('build-istanbul', function () {
    return gulp.src(INDEXEDDB_SOURCES.map(f => f.indexOf('./src/main') === 0 ? `./.istanbul/${f}` : f), { base: 'src' })
        .pipe(sourcemaps.init({ loadMaps: true }))
        .pipe(concat('indexeddb-istanbul.js'))
        //.pipe(uglify(uglify_config))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
}));

const LMDB_SOURCES = [
    './src/loader/nodejs/index.prefix.js',
    ...sources.generic,
    ...sources.backend.lmdb,
    './src/loader/nodejs/index.suffix.js'
];

gulp.task('build-lmdb', function () {
    return gulp.src(LMDB_SOURCES, { base: 'src' })
        .pipe(sourcemaps.init())
        .pipe(concat('lmdb.js'))
        // .pipe(uglify(uglify_config))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('build-lmdb-istanbul', gulp.series('build-istanbul', function () {
    return gulp.src(LMDB_SOURCES.map(f => f.indexOf('./src/main') === 0 ? `./.istanbul/${f}` : f))
        .pipe(sourcemaps.init())
        .pipe(concat('lmdb-istanbul.js'))
        .pipe(uglify(uglify_config))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
}));

gulp.task('eslint', function () {
    const eslint = require('gulp-eslint');
    return gulp.src(sources.all)
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
});

gulp.task('build', gulp.parallel('build-indexeddb', 'build-indexeddb-babel', 'build-indexeddb-istanbul',
    'build-lmdb', 'build-lmdb-istanbul'));

gulp.task('default', gulp.parallel('build'));
