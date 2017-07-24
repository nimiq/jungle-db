const gulp = require('gulp');
const concat = require('gulp-concat');
const connect = require('gulp-connect');
const jasmine = require('gulp-jasmine-livereload-task');
const sourcemaps = require('gulp-sourcemaps');

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
    test: [
        './src/test/specs/**/*.spec.js'
    ],
    all: [
        './src/main/**/*.js',
        './src/test/**/*.js',
        '!./src/**/node_modules/**/*.js'
    ]
};

gulp.task('build-web', function () {
    return gulp.src(['./src/loader/browser/prefix.js.template'].concat(sources.generic).concat(sources.platform.browser).concat(['./src/loader/browser/suffix.js.template']))
        .pipe(sourcemaps.init())
        .pipe(concat('web.js'))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'))
        .pipe(connect.reload());
});

gulp.task('build-node', function () {
    return gulp.src(['./src/loader/nodejs/index.prefix.js'].concat(sources.generic).concat(sources.platform.node).concat(['./src/loader/nodejs/index.suffix.js']))
        .pipe(sourcemaps.init())
        .pipe(concat('node.js'))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('test', ['watch'], function () {
    gulp.run(jasmine({
        files: ['dist/web.js'].concat(sources.test)
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

gulp.task('build', ['build-web', 'build-node']);

gulp.task('default', ['build']);
