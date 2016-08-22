'use strict';

var gulp   = require('gulp');
var gulpLoadPlugins = require('gulp-load-plugins');
var plugins = gulpLoadPlugins();

gulp.task('default', ['nodemon']);

gulp.task('nodemon', () => {
  plugins.nodemon({
    script: 'main.js',
    ext: 'js',
    ignore: ['gulpfile.js'],
    task: ['lint']
  });
});

gulp.task('lint', () => {
  return gulp.src('./*.js')
    .pipe(plugins.eslint())
    .pipe(plugins.eslint.format());
});
