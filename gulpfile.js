const gulp = require('gulp');
const concat = require('gulp-concat');
const connect = require('gulp-connect');
const jasmine = require('gulp-jasmine-livereload-task');
const sourcemaps = require('gulp-sourcemaps');

const sources = {
    platform: {
        browser: [
            './src/main/platform/browser/Class.js',
            './src/main/platform/browser/JungleDB.js',
            './src/main/platform/browser/KeyRange.js',
            './src/main/platform/browser/Index.js',
            './src/main/platform/browser/Query.js',
            './src/main/platform/browser/ObjectStore.js'
        ],
        node: [
        ]
    },
    generic: [
        './src/main/generic/Query.js'
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
    return gulp.src(['./src/loader/prefix.js.template'].concat(sources.platform.browser).concat(sources.generic).concat(['./src/loader/suffix.js.template']))
        .pipe(sourcemaps.init())
        .pipe(concat('web.js'))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'))
        .pipe(connect.reload());
});

gulp.task('build-node', function () {
    return gulp.src(['./src/main/platform/nodejs/index.prefix.js'].concat(sources.platform.node).concat(sources.generic).concat(['./src/main/platform/nodejs/index.suffix.js']))
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
