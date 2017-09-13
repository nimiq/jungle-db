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
const uglify = require('gulp-uglify');
const util = require('gulp-util');

const sources = {
    platform: {
        browser: [
            './src/main/platform/browser/Class.js',
            './src/main/platform/browser/utils/IDBTools.js',
            './src/main/platform/browser/IDBBackend.js',
            './src/main/platform/browser/JungleDB.js',
            './src/main/platform/browser/PersistentIndex.js'
        ],
        node: [
            './src/main/platform/nodejs/IndexTransaction.js',
            './src/main/platform/nodejs/utils/LevelDBTools.js',
            './src/main/platform/nodejs/LevelDBBackend.js',
            './src/main/platform/nodejs/JungleDB.js',
            './src/main/platform/nodejs/PersistentIndex.js'
        ]
    },
    generic: [
        './src/main/generic/utils/BTree.js',
        './src/main/generic/utils/LRUMap.js',
        './src/main/generic/utils/ObjectUtils.js',
        './src/main/generic/utils/Observable.js',
        './src/main/generic/utils/SetUtils.js',
        './src/main/generic/utils/Synchronizer.js',
        './src/main/generic/CachedBackend.js',
        './src/main/generic/InMemoryIndex.js',
        './src/main/generic/KeyRange.js',
        './src/main/generic/ObjectStore.js',
        './src/main/generic/Query.js',
        './src/main/generic/TransactionIndex.js',
        './src/main/generic/Transaction.js'
    ],
    test: {
        generic: [
            './src/test/generic/DummyBackend.js',
            './src/test/generic/**/*.spec.js'
        ],
        browser: [
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
    plugins: ['transform-runtime', 'transform-es2015-modules-commonjs'],
    presets: ['es2016', 'es2017']
};

const babel_loader = {
    plugins: [['transform-runtime', {
        'polyfill': false
    }]],
    presets: ['env']
};

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
        gulp.src(['./src/loader/browser/prefix.js.template'].concat(sources.platform.browser).concat(sources.generic).concat(['./src/loader/browser/suffix.js.template']), { base: 'src' })
            .pipe(sourcemaps.init())
            .pipe(concat('web.js'))
            .pipe(babel(babel_config)))
        .pipe(sourcemaps.init())
        .pipe(concat('web-babel.js'))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('build-web', function () {
    return gulp.src(['./src/loader/browser/prefix.js.template'].concat(sources.platform.browser).concat(sources.generic).concat(['./src/loader/browser/suffix.js.template']), { base: 'src' })
        .pipe(sourcemaps.init())
        .pipe(concat('web.js'))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'))
        .pipe(connect.reload());
});

gulp.task('build-node', function () {
    return gulp.src(['./src/loader/nodejs/index.prefix.js'].concat(sources.generic).concat(sources.platform.node).concat(['./src/loader/nodejs/index.suffix.js']), { base: 'src' })
        .pipe(sourcemaps.init())
        .pipe(concat('node.js'))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('test', ['watch'], function () {
    gulp.run(jasmine({
        files: ['dist/web.js'].concat(sources.test.generic).concat(sources.test.browser)
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

gulp.task('build', ['build-web', 'build-node', 'build-web-babel']);

gulp.task('default', ['build']);
