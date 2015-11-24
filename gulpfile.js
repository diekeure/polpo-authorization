/*!
 * gulp
 * $ npm install gulp gulp-jshint gulp-concat gulp-uglify gulp-rename --save-dev
 */

// Load plugins
var gulp = require('gulp'),
	jshint = require('gulp-jshint'),
	concat = require('gulp-concat'),
	//wrap = require('gulp-wrap'),
	rename = require('gulp-rename'),
	uglify = require('gulp-uglify');

// Scripts
gulp.task('scripts', function () {
	return gulp.src(['src/**/*.js'])
		.pipe(jshint('.jshintrc'))
		.pipe(jshint.reporter('default'))
		.pipe(concat('polpo-authorization.js'))
		//.pipe(wrap('(function(window, angular, undefined){\n"use strict";\n<%= contents %>\n})(window, window.angular);'))
		.pipe(gulp.dest('dist'))
		.pipe(rename({suffix: '.min'}))
		.pipe(uglify())
		.pipe(gulp.dest('dist'));
});

// Default task
gulp.task('build', function () {
	gulp.start('scripts');
});