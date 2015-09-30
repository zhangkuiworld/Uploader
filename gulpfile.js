var pkg = require('./package.json')
var gulp = require('gulp')
var eslint = require('gulp-eslint')
var browserify = require('gulp-browserify')
var header = require('gulp-header')
var uglify = require('gulp-uglify')
var concat = require('gulp-concat')
var sourcemaps = require('gulp-sourcemaps')

var spawn = require('child_process').spawn
var _ = require('./src/utils')
var karma = require('karma').server

var name = 'uploader'
var NAME = name.charAt(0).toUpperCase() + name.substr(1)
var fname = name + '.js'
var mname = name + '.min.js'

var paths = {
	src: 'src/',
	dist: 'dist/'
}
var allFiles = paths.src + '*.js'
var banner = [
	'/*!',
	' * ' + NAME + ' - <%= pkg.description %>',
	' * @version v<%= pkg.version %>',
	' * @author <%= pkg.author %>',
	' * @link <%= pkg.homepage %>',
	' * @license <%= pkg.license %>',
	' */',
	''
].join('\n')

gulp.task('eslint', function () {
	return gulp.src(allFiles)
		.pipe(eslint({
			useEslintrc: true
		}))
		.pipe(eslint.format())
		.pipe(eslint.failOnError())
})

gulp.task('scripts', ['eslint'], function() {
	return gulp.src(paths.src + fname)
		.pipe(browserify({
			debug: false,
			standalone: 'Uploader',
			transform: ['browserify-versionify']
		}))
		.pipe(header(banner, {
			pkg: pkg
		}))
		.pipe(gulp.dest(paths.dist))
});

gulp.task('build', ['scripts'], function () {
	return gulp.src(paths.dist + fname)
		.pipe(sourcemaps.init())
		.pipe(uglify({
			preserveComments: 'license'
		}))
		.pipe(concat(mname))
		.pipe(sourcemaps.write('./', {
			includeContent: false
		}))
		.pipe(gulp.dest(paths.dist))
})

var karmaBaseConfig = {
	frameworks: ['jasmine', 'commonjs'],
	files: [
		'node_modules/sinon/pkg/sinon-1.17.1.js',
		'test/unit/lib/FakeXMLHttpRequestUpload.js',
		'src/**/*.js',
		'test/unit/specs/**/*.js'
	],
	preprocessors: {
		'src/**/*.js': ['commonjs'],
		'test/unit/specs/**/*.js': ['commonjs']
	},
	singleRun: true
}

gulp.task('unit', function (done) {
	var karmaUnitConfig = _.extend({}, karmaBaseConfig, {
		browsers: ['Chrome', 'Firefox', 'Safari'],
		reporters: ['progress']
	})
	karma.start(karmaUnitConfig, done)
})

gulp.task('cover', function (done) {
	var karmaCoverageConfig = _.extend({}, karmaBaseConfig, {
		browsers: ['PhantomJS'],
		reporters: ['progress', 'coverage'],
		preprocessors: {
			'src/**/*.js': ['commonjs', 'coverage'],
			'test/unit/specs/**/*.js': ['commonjs']
		},
		coverageReporter: {
			reporters: [
				{
					type: 'lcov',
					subdir: '.'
				},
				{
					type: 'text-summary',
					subdir: '.'
				}
			]
		}
	})
	karma.start(karmaCoverageConfig, done)
})

gulp.task('karma', function (done) {
	karma.start(karmaBaseConfig, done)
})

gulp.task('sauce', function (done) {
	var customLaunchers = {
		sl_chrome: {
			base: 'SauceLabs',
			browserName: 'chrome',
			platform: 'Windows 7'
		},
		sl_firefox: {
			base: 'SauceLabs',
			browserName: 'firefox'
		},
		sl_mac_safari: {
			base: 'SauceLabs',
			browserName: 'safari',
			platform: 'OS X 10.10'
		},

		sl_ie_10: {
			base: 'SauceLabs',
			browserName: 'internet explorer',
			platform: 'Windows 8',
			version: '10'
		},
		sl_ie_11: {
			base: 'SauceLabs',
			browserName: 'internet explorer',
			platform: 'Windows 8.1',
			version: '11'
		},

		sl_ios_safari: {
			base: 'SauceLabs',
			browserName: 'iphone',
			platform: 'OS X 10.9',
			version: '7.1'
		},
		sl_android: {
			base: 'SauceLabs',
			browserName: 'android',
			platform: 'Linux',
			version: '4.2'
		}
	}
	var sauceConfig = _.extend({}, karmaBaseConfig, {
		sauceLabs: {
			testName: 'uploader unit tests',
			recordScreenshots: false,
			tunnelIdentifier: process.env.TRAVIS_JOB_NUMBER,
			build: process.env.TRAVIS_JOB_ID || Date.now(),
			username: 'dolymood',
			accessKey: '297fafe2-fa71-4239-9726-5c46dd8a467b'
		},
		captureTimeout: 300000,
		browserNoActivityTimeout: 300000,
		browsers: Object.keys(customLaunchers),
		customLaunchers: customLaunchers,
		reporters: ['progress', 'saucelabs']
	})
	karma.start(sauceConfig, done)
})

gulp.task('test', ['unit', 'cover'])

gulp.task('testSpecs', function () {
	return gulp.src('test/unit/specs/*.js')
		.pipe(browserify({
			debug: false
		}))
		.pipe(concat('specs.js', {newLine: ';'}))
		.pipe(gulp.dest('test/unit/'))
})

gulp.task('watch', function () {
	gulp.watch(allFiles, ['scripts'])
	gulp.watch('test/unit/specs/**/*.js', ['testSpecs'])
})

gulp.task('default', ['build', 'test'])

var argv = require('yargs').argv
var versioning = function () {
	if (argv.minor) {
		return 'minor'
	}
	if (argv.major) {
		return 'major'
	}
	return 'patch'
}
var bump = require('gulp-bump')
gulp.task('version', ['cover', 'build', 'sauce'], function () {
	return gulp.src('./package.json')
		.pipe(bump({type: versioning()}))
		.pipe(gulp.dest('./'))
})

var git = require('gulp-git')
var tag_version = require('gulp-tag-version')
gulp.task('git', ['version'], function (done) {
	var v = require('./package.json').version
	gulp.src('./')
		.pipe(git.add({args: '-A'}))
		.pipe(git.commit('[release] ' + v))
		.pipe(tag_version({version: v}))
		.on('end', function () {
			git.push('origin', 'master', {args: '--tags'})
			done()
		})
})

gulp.task('npm-publish', ['git'], function (done) {
	spawn('npm', ['publish'], {stdio: 'inherit'}).on('close', done)
})

gulp.task('release', ['npm-publish'])

if (process.env.TRAVIS_PULL_REQUEST) {
	// pull request
	gulp.task('ci', ['cover', 'build'])
} else {
	gulp.task('ci', ['cover', 'build', 'sauce'])
}
