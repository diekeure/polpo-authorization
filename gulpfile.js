/*!
 * gulp
 * $ npm install gulp gulp-jshint gulp-concat gulp-uglify gulp-rename --save-dev
 */

// Load plugins
var gulp = require('gulp'),
    jshint = require('gulp-jshint'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename'),
    concat = require('gulp-concat');

// Scripts
gulp.task('scripts', function () {
    return gulp.src(['src/**/*.js'])
        .pipe(jshint('.jshintrc'))
        .pipe(jshint.reporter('default'))
        .pipe(concat('polpo-authorization.js'))
        .pipe(gulp.dest('dist'))
        .pipe(rename({suffix: '.min'}))
        .pipe(uglify())
        .pipe(gulp.dest('dist'));
});

// Default task
gulp.task('build', function () {
    gulp.start('scripts');
});