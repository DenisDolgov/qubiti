'use strict';
/**
 * Сборщик верстки для шаблонов Битрикс
 *
 * известные баги:
 * 1. Если в компонентах нет ни одного файла style.scss, то таск по сборке стилей будет падать
 * 2. При удалении файлов в интерактивном режиме, сервер скорее всего упадет.
 *    Просто заново запускаем и не забиваем себе голову.
 */

module.exports = function(gulp, currentTemplateDir) {

/** @const */
const
	 fs = require('fs')
	,extend = require('extend')
	,path = require('path')
	,decodeKeypress = require('decode-keypress')
	,del = require('del')
	,envify = require('envify/custom')
	,glob = require('glob')
	,autoprefixer = require('gulp-autoprefixer')
	,browserify = require('gulp-browserify')
	,concat = require('gulp-concat')
	,cssnano = require('gulp-cssnano')
	,convertSourceMap = require('convert-source-map')
	,data = require('gulp-data')
	,debug = require('gulp-debug')
	,filter = require('gulp-filter')
	,googleWebFonts = require('gulp-google-webfonts')
	,helpDoc = require('gulp-help-doc')
	,iconfont = require('gulp-iconfont')
	,iconfontCss = require('gulp-iconfont-css')
	,imagemin = require('gulp-imagemin')
	,sass = require('gulp-sass')
	,nunjucksRender = require('gulp-nunjucks-render')
	,nunjucksIncludeData = require('nunjucks-includeData')
	,plumber = require('gulp-plumber')
	,rename = require('gulp-rename')
	,sourcemaps = require('gulp-sourcemaps')
	,tap = require('gulp-tap')
	,uglify = require('gulp-uglify')
	,gutil = require('gulp-util')
	,watch = require('gulp-watch')
	,spritesmith = require('gulp.spritesmith')
	,merge = require('merge-stream')
	,runSequence = require('run-sequence').use(gulp)
	,vbuf = require('vinyl-buffer')
	,vsrc = require('vinyl-source-stream')
;

//noinspection JSCheckFunctionSignatures
var browserSync = require('browser-sync').create();
var isInteractiveMode = false;

var conf = {
	//noinspection JSUnresolvedVariable
	curDir: currentTemplateDir
	,debug: true
	,production: false
	,assets: {
		min_css: false,
		min_js: false
	}
	,dev_mode: {
		// В dev_mode (conf.production == false)
		// вместо bundle.css файла
		// используются отдельные файлы css-bundle-а
		// подключенные непосредственно в html-е.
		// Соответственно:

		// можно не синхронизировать в browser-sync
		// файл bundle[.min].css
		// опция в консоли: --dev-no-bsync-css-bundle-file
		no_bsync_css_bundle_file: false,
		// Вообще не собирать файл bundle[.min].css
		// Но после окончания работ надо не забывать собрать бандл руками
		// опция в консоли: --dev-no-build-css-bundle-file
		no_build_css_bundle_file: false
	}
	,browserSync: {
		server: './'
		,index: '/html/index.html'
		,open: false
		,proxyLamp: 'default.loc'
	}
	,html: {
		base: 'pages'
		,pages: [
			'@base/**/*.njk'
			,'!@base/**/_*.njk'
			,'!@base/**/_*/**/*.njk'
		]
		,components: [
			 'components/*/*/{*,.*}/**/*.njk'
			,'components/*/*/{*,.*}/*/*/{*,.*}/**/*.njk'
		]
		,watch: [
			 '@base/**/*.njk'
			,'@base/**/*.json'

			,'components/*/*/{*,.*}/**/*.njk'
			,'components/*/*/{*,.*}/**/*.json'
			,'components/*/*/{*,.*}/*/*/{*,.*}/**/*.njk'
			,'components/*/*/{*,.*}/*/*/{*,.*}/**/*.json'
		]
		,dest: 'html'
		,bx_component: {
			 use_minified_js: false
			,use_minified_css: false
			,debug_assets: !!gutil.env['debug-bx-assets']
		}
	}
	,sass: {
		main: {
			 base: 'sass'
			,dest: 'css'
			,bundle: '@base/_bundle.css'
			,files: [
				'@base/**/*.scss'

				// Исключаем файлы с переменными sass
				,'!@base/**/var{,s,iable{,s}}{,.*,-*}{,/*,/**/*}.scss'

				// исключаем twitter bootstrap (но только подпапки))
				// файлы именыемые bootstrap*.scss не исключаем
				// для возможности отдельной сборки
				,'!@base/**/bootstrap{,.*,-*}{/*,/**/*}.scss'

				// Исключаем файлы и папки начинающие с подчеркивания.
				//    Будем применять их для импортируемых файлов
				//    без возможности автономной компиляции
				,'!@base/**/_{*,*/*,/**/*}.scss'

				// Исключаем библиотеки миксинов sass
				,'!@base/**/mixin{,s}{,.*,-*}{,/*,/**/*}.scss'
				,'!@base/**/lib{,s,rary{,s}}{,.*,-*}{,/*,/**/*}.scss'
			]
			,watchImports: [
				 // Это те файлы библиотек при которых пересобираем все несущие sass-файлы
				 // смотри исключения в conf.sass.main.files
				 '@base/var{,s,iable{,s}}{,.*,-*}{,/*,/**/*}.scss'
				,'@base/bootstrap{,.*,-*}{/*,/**/*}.scss'
				,'@base/_*{,/*,/**/*}.scss'
				,'@base/**/_{*,*/*,/**/*}.scss'
				,'@base/**/_{*}.scss'
				,'@base/mixin{,s}{,.*,-*}{,/*,/**/*}.scss'
				,'@base/lib{,s,rary{,s}}{,.*,-*}{,/*,/**/*}.scss'
				// При изменении файлов входящих в src пересобираем файлы по одному
				// Дабы браузер быстрее реагировал в режиме разработки
			]
		}
		,components: {
			 styleName: 'style.scss'
			,files: [
				 'components/*/*/{*,.*}/@styleName'
				,'components/*/*/{*,.*}/*/*/{*,.*}/@styleName'
			]
			,watch: [
				 'components/*/*/**/*.scss'
				,'components/*/*/{*,.*}/**/*.scss'
				,'components/*/*/{*,.*}/*/*/{*,.*}/**/*.scss'
			]
		}
	}
	,js: {
		bundle: {
			src: 'js/src/_*.js'
			,out: 'js/bundle.*.js'
			,watch: 'js/src/**/*.js'
		}
		,vendor: {
			src: 'js/vendor/_bundle.js'
			,out: 'js/bundle.vendor.js'
			,shim: {

			}
		}
		,scripts: [
			'js/**/*.js'

			// исключаем исходники для require с прозвольными именами, но с префиксом "_"
			,'!js/**/_*.js'
			,'!js/**/_*/*.js'

			// исключаем исходники для require
			,'!js/src/**/*.js'
			,'!js/vendor/**/*.js'

			// Исключаем уже собранные файлы
			,'!js/**/*{.,-}min.js'
			,'!js/bundle.*.js'

			// Собираем компонентныt js-aфайлы
			,'components/*/*/**.js'
			,'components/*/*/{*,.*}/**/*.js'
			,'components/*/*/{*,.*}/*/*/{*,.*}/**/*.js'

			// Исключаем уже собранные файлы и всякое для require
			,'!components/*/*/{*,.*}/**/*{.,-}min.js'
			,'!components/*/*/{*,.*}/*/*/{*,.*}/**/*{.,-}min.js'
			,'!components/*/*/{*,.*}/vendor/**/*.js'
			,'!components/*/*/{*,.*}/*/*/{*,.*}/vendor/**/*.js'
			,'!components/*/*/{*,.*}/**/_*.js'
			,'!components/*/*/{*,.*}/**/_*/*.js'
			,'!components/*/*/{*,.*}/*/*/{*,.*}/**/_*/*.js'
		]
	}
	,images: {
		src: [ 'img.src/**/*.{jpeg,jpg,png,gif,ico}',
				'!img.src/svgicons'
		]
		,dest: 'images'
	}
	,sprites: {
		src: 'sprites'
		,imgUrl: '../images/sprites'
		,minify: true
		,dest: {
			img: 'images/sprites',
			sass: 'sass/include/sprites',
			sassMixins: 'sass/include/sprites/mixins.scss'
		}
	}
	,googleWebFonts: {
		fontsList: 'fonts/gwf/google-web-fonts.list' // relative to the site template root
		,fontsDir: '../fonts/gwf/' // fontsDir is relative to dest
		,cssDir: 'lib/' // cssDir is relative to dest
		,cssFilename: 'google-web-fonts.scss'
		,dest: './sass/'
	}
	,svgIconFont: {
		src: 'img.src/svgicons/**/*.svg'
		,formats: ['woff2', 'woff', 'ttf', 'eot', 'svg']
		,sass: {
			template: 'img.src/svgicons/_sass.tmpl'
			// result path is relative to dest folder i.e. fonts/svgicons in this case
			,result: '../../sass/mixins/svgicons.scss'
		}
		,dest: 'fonts/svgicons'
	}
};

extend(true, conf, require(conf.curDir+'/gulpfile.config.js'));

function replacePlaceHolder(object, replace, callcount) {
	if(typeof(callcount) == 'undefined') callcount = 1;
	if(parseInt(callcount) <= 1) {callcount = 1};
	if(typeof(object) != 'object') {
		return;
	}
	// var offset = '  ';
	// for(var i=0; i<callcount; i++) {
	// 	offset += offset;
	// }
	var itemWork = function(key) {
		switch(typeof(object[key])) {
			case 'object':
				//onsole.log(offset+key+':object:'+callcount);
				replacePlaceHolder(object[key], replace, (callcount+1));
				break;
			case 'string':
				//onsole.log(offset+key+':string:'+callcount);
				object[key] = object[key].replace(replace.cond, replace.value);
				break;
			default:
				break;
		}
	};
	if(Array.isArray(object)) {
		for(var key=0; key < object.length; key++) {
			itemWork(key);
		}
	}
	else {
		for(var key in object) {
			if(object.hasOwnProperty(key)) {
				itemWork(key);
			}
		}
	}
}
replacePlaceHolder(conf.html, {cond: /@base/, value: conf.html.base});
replacePlaceHolder(conf.sass.main, {cond: /@base/, value: conf.sass.main.base});
replacePlaceHolder(conf.sass.components.files, {cond: /@styleName/, value: conf.sass.components.styleName});


conf.debug = !!(gutil.env.debug ? true : conf.debug);
conf.production = !!(gutil.env.production ? true : conf.production);

if( conf.production ) {
	conf.assets.min_css = true;
	conf.assets.min_js = true;
	conf.html.bx_component.use_minified_css = true;
	conf.html.bx_component.use_minified_js = true;
}

if( typeof(gutil.env['assets-min']) != 'undefined' ) {
	var isAllAssetsIsMinified = parseArgAsBool(gutil.env['assets-min']);
	conf.assets.min_css = isAllAssetsIsMinified;
	conf.assets.min_js = isAllAssetsIsMinified;
	conf.html.bx_component.use_minified_css = isAllAssetsIsMinified;
	conf.html.bx_component.use_minified_js = isAllAssetsIsMinified;
}
if( typeof(gutil.env['assets-min-css']) != 'undefined' ) {
	conf.assets.min_css = parseArgAsBool(gutil.env['assets-min-css']);
	conf.html.bx_component.use_minified_css = conf.assets.min_css;
}
if( typeof(gutil.env['assets-min-js']) != 'undefined' ) {
	conf.assets.min_js = parseArgAsBool(gutil.env['assets-min-js']);
	conf.html.bx_component.use_minified_js = conf.assets.min_js;
}


if( typeof(gutil.env['dev-no-bsync-css-bundle-file']) != 'undefined' ) {
	conf.dev_mode.no_bsync_css_bundle_file = parseArgAsBool(gutil.env['dev-no-bsync-css-bundle-file']);
}
if( typeof(gutil.env['dev-no-build-css-bundle-file']) != 'undefined' ) {
	conf.dev_mode.no_build_css_bundle_file = parseArgAsBool(gutil.env['dev-no-build-css-bundle-file']);
}

function parseArgAsBool(value) {
	if( typeof(value) == 'string' ) {
		value = value.trim().toUpperCase();
		switch(value) {
			case 'N':
			case 'NO':
			case 'FALSE':
			case 'OFF':
			case '0':
				return false;
		}
		return true;
	}
	return !!value;
}

// "Проглатывает" ошибку, но выводит в терминал
function swallowError(error) {
	gutil.log(error);
	this.emit('end');
}

var browserSyncTimeout = 0;
function onTaskEnd() {

}
function onTaskEndBrowserReload() {
	clearTimeout(browserSyncTimeout);
	browserSyncTimeout = setTimeout(browserSync.reload, 200);
}

function getRelPathByChanged(changedFile) {
	if(changedFile.path.indexOf(conf.curDir) !== 0) {
		throw 'Обращение к файлу лежащему за пределами собираемого шаблона!:'
				+'\n    Путь: '+changedFile.path
				+'\n    Во избежание неожиданного поведения сборщика операция не допускается.';
	}
	return substr(changedFile.path, conf.curDir.length+1);
}
function substr( f_string, f_start, f_length ) {
	// Return part of a string
	//
	// +	 original by: Martijn Wieringa
	if(f_start < 0) {
		f_start += f_string.length;
	}
	if(f_length == undefined) {
		f_length = f_string.length;
	} else if(f_length < 0){
		f_length += f_string.length;
	} else {
		f_length += f_start;
	}
	if(f_length < f_start) {
		f_length = f_start;
	}
	return f_string.substring(f_start, f_length);
}
var isArray = (function () {
	// Use compiler's own isArray when available
	if (Array.isArray) {
		return Array.isArray;
	}

	// Retain references to variables for performance
	// optimization
	var objectToStringFn = Object.prototype.toString,
		arrayToStringResult = objectToStringFn.call([]);

	return function (subject) {
		return objectToStringFn.call(subject) === arrayToStringResult;
	};
}());

var browserSyncReloadIsActive = true;
function switchBroserSync(state) {
	if( state instanceof Boolean ) {
		browserSyncReloadIsActive = state;
	}
	else {
		browserSyncReloadIsActive = !browserSyncReloadIsActive;
	}
}
function browserSyncStream() {
	return browserSyncReloadIsActive
		? browserSync.stream()
		: gutil.noop()
}
function browserSyncReload() {
	if( browserSyncReloadIsActive ) {
		browserSync.reload();
	}
}

/**
 * Сборка sass-файлов
 * @task {sass}
 * @order {3}
 */
var cssBundleFiles = null;
//gulp.task('sass', ['sass-main-bundle', 'sass-components']);
// нет смысла запускать параллельно - нет прироста в скорости
// а последовательный запуск понятнее отлаживать при случае
gulp.task('sass', function(done) {
	runSequence('sass-main', 'sass-components', 'css-bundle', done);
});

gulp.task('sass-main', function() {
	return sassCommonPipe(
		gulp.src(conf.sass.main.files, {dot: true}),
		conf.sass.main.dest,
		conf.debug ? 'main sass:' : ''
	);
});
gulp.task('sass-main-bundle', function(done) {
	console.log('sass-main-bundle');
	runSequence('sass-main', 'css-bundle', done);
});
gulp.task('sass-components', function(done) {
	return sassCommonPipe(
		gulp.src(conf.sass.components.files, {dot: true, base: '.'}),
		'.',
		conf.debug ? 'component sass:' : ''
	);
});
function sassCommonPipe(stream, dest, debugTitle) {
	var debugMode = true;
	if( 'string' != typeof(debugTitle)
		|| '' == debugTitle
	) {
		debugMode = false;
	}

	function mapSources(sourcePath, file) {
		var compileFilePath = file.path.replace(conf.curDir+'/', '');
		var compileFileName = path.basename(compileFilePath);
		var compileDir = path.dirname(compileFilePath);

		var srcFileName = path.basename(sourcePath);
		var srcFileDir = path.dirname(sourcePath);
		var upToRoot = path.relative('/'+compileDir, '/');

		var resultSrc = upToRoot+'/'+compileDir+'/'+sourcePath;
		if( dest == '.' || dest == './' || dest == '.\\' ) {
			resultSrc = upToRoot+'/'+sourcePath;
		}
		return resultSrc;
	}

	const filterOutMapFiles = filter(
		function(file) {
			return '.map' !== file.path.substring(file.path.length-4, file.path.length);
		},
		{restore: true}
	);

	stream.pipe(plumber())
		.pipe(rename({extname: '.scss'}))
		.pipe(sourcemaps.init())
		.pipe(sass())
		.pipe(debugMode ? debug({title: debugTitle}) : gutil.noop())
		// fix for stop watching on sass compile error)
		.on('error', swallowError)
		//.pipe(autoprefixer())

		.pipe(sourcemaps.write('.', { includeContent: true, mapSources: mapSources }))
		.pipe(gulp.dest(dest))

		.pipe(filterOutMapFiles)
		.pipe(rename({extname: '.min.css'}))
		.pipe(cssnano({zindex: false /*трудно понять зачем нужна такая фича, но мешает она изрядно*/}))
		.pipe(sourcemaps.write('.', { includeContent: true }))
		.pipe(filterOutMapFiles.restore)

		.pipe(debugMode ? debug({title: debugTitle}) : gutil.noop())
		.pipe(gulp.dest(dest))
		.pipe(browserSyncStream())
		.on('end', onTaskEnd)
	;
	return stream;
}
function sassWatcher(changedFile, target) {
	console.log('sassWatcher');
	var file = getRelPathByChanged(changedFile)
		,fileName = path.basename(file)
		,stream = null
		,dest = null
		,targetTitle = null
		,styleFile = null
		,fileStat = fs.lstatSync(changedFile.path)
	;
	if( fileStat.isDirectory() ) {
		return;
	}
	switch(target) {
		case 'main':
			stream = gulp.src(file, {dot: true, base: conf.sass.main.base});
			stream.pipe(tap(function(file) {
				var filePath = file.path.replace(/\\/g, '/');
				var sassDir = conf.curDir+'/'+conf.sass.main.base;
				var relSassFilePath = null;
				sassDir = sassDir
					.replace(/\\/g, '/')
					.replace(/\/\//g, '/');
				if(filePath.indexOf(sassDir) !== 0) {
					throw 'sasscss file out of configured sass dir: "'+filePath+'"';
				}
				relSassFilePath = conf.sass.main.dest+'/'+substr(filePath, sassDir.length+1);
				relSassFilePath = relSassFilePath
					.trim()
					.replace(/\/\//g, '/')
					.replace(/\.scss$/, '.css');
				if( null !== cssBundleFiles
					&& cssBundleFiles.indexOf(relSassFilePath) !== -1
				) {
					runSequence('css-bundle');
				}
			}));
			dest = conf.sass.main.dest;
			if(conf.debug) gutil.log('sass watcher: '+gutil.colors.blue(file));
			break;
		case 'components':
			dest = path.dirname(file);
			stream = gulp.src(dest+'/'+conf.sass.components.styleName, {dot: true});
			if(conf.debug) gutil.log(
				'sass watcher: '
				+gutil.colors.blue(dest+'/'
					+((fileName == conf.sass.components.styleName)
						? '{ '+fileName+' -> '+fileName.replace(/\.scss$/, '.css')+' }'
						: '{ '
							+'changed: '+fileName+';  compiling: '
							+conf.sass.components.styleName +' -> '
							+conf.sass.components.styleName.replace(/\.scss$/, '.css')
							+' }'
					)
				)
			);
			break;
		default:
			throw 'sass-watcher: wrong watcher target';
	}
	sassCommonPipe(stream, dest, conf.debug ? 'sass watcher:' : '');
	return stream;
}

/**
 * Сборка css-bundle-а
 * @task {css-bundle}
 * @order {4}
 */
gulp.task('css-bundle', function() {
	var stream = new merge();

	stream.add(parseCssBundleImportList(function(bundleName, relBundleFilePath, cssBundleFiles, cssBundleFilesImport) {

		if( conf.production
			|| !isInteractiveMode
			|| !conf.dev_mode.no_build_css_bundle_file
		) {
			if( cssBundleFilesImport.length > 0 ) {
				stream.add(gulp.src(relBundleFilePath, {dot: true})
					.pipe(rename(bundleName+'-import.css'))
					.pipe(tap(function(file) {
						file.contents = new Buffer(cssBundleFilesImport, 'utf-8');
					}))
					.pipe(gulp.dest(conf.sass.main.dest))
					// Уведомляем браузер если изменился bundle-import.css
					.pipe(browserSyncStream())
				);
			}

			if(null !== cssBundleFiles && cssBundleFiles.length > 0) {
				var bundleStream = gulp.src(cssBundleFiles, {dot: true})
					.pipe(conf.debug ? debug({title: 'css bundle file:'}) : gutil.noop())
					.pipe(plumber())
					.pipe(sourcemaps.init({loadMaps: true}))
					.pipe(tap(function(file) {
						// исправляем в стилях url(...)
						var cssFile = getRelPathByChanged(file);
						cssFile = cssFile
							.replace(/\\/g, '/')
							.replace(/\/\/\//g, '/')
							.replace(/\/\//g, '/')
							.replace(/^\//, '')
							.replace(/\/$/, '');
						var cssSrcDir = path.dirname(cssFile).trim();
						var dest = conf.sass.main.dest.trim().replace(/^\//, '').replace(/\/$/, '');
						dest = dest
							.replace(/\\/g, '/')
							.replace(/\/\/\//g, '/')
							.replace(/\/\//g, '/')
							.replace(/^\//, '')
							.replace(/\/$/, '');
						var stepsToRootFromDest = path.relative('/'+dest, '/');
						var urlPrefix = stepsToRootFromDest+'/'+cssSrcDir+'/';

						file.contents = new Buffer(
							'\n/* '+cssFile+' */\n'+
							file.contents
								.toString()
								.trim()
								// исправляем в стилях url(...)
								.replace(/(url\(['"]?)(.*?)(['"]?\))/gim, '$1'+urlPrefix+'$2$3')
								// Удаляем возможные sourceMappingURL уже включенные в css-bundle
								.replace(/\n{0,2}\/\*#\s*sourceMappingURL(.*?)\*\//, '')
								.trim()
							,'utf-8'
						);

					}));
					bundleStream
					.pipe(concat(bundleName+'.css'))
					.pipe(sourcemaps.write('./'))
					.pipe(gulp.dest(conf.sass.main.dest))
					.pipe(tap(function(file) {
						var relFilePath = getRelPathByChanged(file);
						if(path.extname(relFilePath) === '.css') {
							var dest = path.dirname(relFilePath);
							stream.add(gulp.src(relFilePath)
								.pipe(sourcemaps.init({loadMaps: true}))
								.pipe(rename({extname: '.min.css'}))
								.pipe(cssnano({zindex: false}))
								// Уведосляем браузер о том, что изменился собранный
								// файл css-bundle-а,
								// ! но только в том случае, если
								// сборка работает в production-режиме.
								// В ином случае файлы бандла
								// подключены непосредственно в html-е
								.pipe(
									( conf.production
										|| !isInteractiveMode
										|| !conf.dev_mode.no_bsync_css_bundle_file
									)
									? browserSyncStream()
									: (conf.debug
										? debug({title: 'ignoring browser-sync update of css-bundle:'})
										: gutil.noop()
									)
								)
								.pipe(sourcemaps.write('./'))
								.pipe(gulp.dest(dest))
							);
						}
					}));

				stream.add(bundleStream);
			}
		}
		else if(conf.debug) {
			gutil.log('ignoring building of css-bundle: '+gutil.colors.blue(bundleName+'.css')+gutil.colors.gray(' (--dev-no-build-css-bundle-file)'));
		}
	}));

	stream.on('end', onTaskEnd)
	return stream;
});

gulp.task('css-bundle-parse-imports-list', function(done) {
	return parseCssBundleImportList();
});

function parseCssBundleImportList(afterParseCallback) {
	cssBundleFiles = [];
	var cssBundleFilesImport = '';
	return gulp.src(conf.sass.main.bundle)
		.pipe(conf.debug ? debug({title: 'css bundle:'}) : gutil.noop())
		.pipe(tap(function(file) {
			var bundleName = path.basename(file.path)
				.replace(/^_/, '')
				.replace(/\.(scss|css)$/i, '');
			var relBundleFilePath = getRelPathByChanged(file);

			var regim = /\s*@import\s*['"]([a-zA-Z0-9_\-\/\.]+)(?:\.css|\.scss)['"]\;\s*/gim;
			var rei = /\s*@import\s*['"]([a-zA-Z0-9_\-\/\.]+)(?:\.css|\.scss)['"]\;\s*/i;
			var matchedStringList = file.contents
				.toString()
				.replace(/^\/\/(.*)/gim, '') // remove line comments
				.replace(/\/\*[\s\S]*?\*\/\n?/gim, '') // remove multi line comments
				.match(regim);
			if( matchedStringList.length > 0 ) {
				for(var iMatched=0; iMatched < matchedStringList.length; iMatched++) {
					var matchedString = matchedStringList[iMatched].trim();
					var match = matchedString.match(rei);
					if( match ) {
						var importedCssFile = match[1]+'.css';
						cssBundleFiles.push(conf.sass.main.dest+'/'+importedCssFile);
						cssBundleFilesImport +='@import "'+importedCssFile+'";\n';
					}
				}
			}

			if( typeof(afterParseCallback) == 'function' ) {
				afterParseCallback.call(this, bundleName, relBundleFilePath, cssBundleFiles, cssBundleFilesImport);
			}
		}));
}

/**
 * Сборка html-файлов
 * @task {html}
 * @order {2}
 */
var htmlTaskCurrentFile = null;
var nunjucksEnvironment = null;
var assetsJs = {};
var assetsCss = {};
gulp.task('html', function(done) {
	if( null === cssBundleFiles ) {
		// Если у нас нет данных о файлах css-bundle-а, то сначала запустим
		// сборку этих данных и получим эти данные
		//runSequence('css-bundle', '--html-nunjucks', done);

		// Для сборки надо знать только имена css-файлов,
		// совсем не обязательно собирать bundle, ибо долго
		runSequence('css-bundle-parse-imports-list', '--html-nunjucks', done);
	}
	else {
		runSequence('--html-nunjucks', done);
	}
});
// Это системная задача, которая не должна выполняться через консоль
// Есть гепотиза, что если дать ей имя с префиксом в виде двух дефисов
// то интерпретатор команд не сможет скормить gulp-у --html-nunjucks
// как имя задачи, ибо "--agrument-name" интерпретируется как аргумент getopts
// а значит будет разрешено только внутреннее использование
// только в javascript-коде
gulp.task('--html-nunjucks', function() {
	nunjucksRender.nunjucks.configure();
	assetsJs = {};
	assetsCss = {};
	return gulp.src(conf.html.pages)
		.pipe(plumber())
		.pipe(conf.debug ? debug({title: 'compile page: '}) : gutil.noop())
		//.pipe(twig())
		.pipe(tap(function(file) {
			htmlTaskCurrentFile = getRelPathByChanged(file);
		}))
		.pipe(data(function(file) {
			var currentFile = getRelPathByChanged(file);
			return {
				PRODUCTION: conf.production
				,CSS_BUNDLE_FILES: cssBundleFiles
				,__PAGE__: currentFile
				,__PATH__: path.dirname(currentFile)
			};
		}))
		.pipe(nunjucksRender({
			path: conf.curDir
			,ext: '.html'
			,manageEnv: function(env) {
				nunjucksEnvironment = env;
				env.addExtension('BitrixComponents', new nunjucksBitrixComponentTag());
				nunjucksIncludeData.install(env);
			}
		}))
		.pipe(tap(function(file) {
			var cssOut = '<!-- @bx_component_assets_css -->\n';
			if( null !== htmlTaskCurrentFile
				&& typeof(assetsCss[htmlTaskCurrentFile]) != 'undefined'
				&& assetsCss[htmlTaskCurrentFile].length > 0
			) {
				for(let iFile=0; iFile < assetsCss[htmlTaskCurrentFile].length; iFile++) {
					let href = assetsCss[htmlTaskCurrentFile][iFile];
					cssOut += '<link type="text/css" rel="stylesheet" href="'+href+'">\n';
				}
			}
			var jsOut = '<!-- @bx_component_assets_js -->\n';
			if( null !== htmlTaskCurrentFile
				&& typeof(assetsJs[htmlTaskCurrentFile]) != 'undefined'
				&& assetsJs[htmlTaskCurrentFile].length > 0
			) {
				for(let iFile=0; iFile < assetsJs[htmlTaskCurrentFile].length; iFile++) {
					let href = assetsJs[htmlTaskCurrentFile][iFile];
					jsOut += '<script type="text/javascript" src="'+href+'"></script>\n';
				}
			}
			file.contents = new Buffer(file.contents.toString()
				.replace(/<!--[\s]*@bx_component_assets_css[\s]*-->\n?/, cssOut)
				.replace(/<!--[\s]*@bx_component_assets_js[\s]*-->\n?/, jsOut)
			);
		}))
		.pipe(gulp.dest(conf.html.dest))
		.on('end', onTaskEnd)
		.on('end', function() { browserSyncReload(); })
	;

});

/**
 * Таким образом будет эмулироваться поведение компонентов битрикс
 * используем теги вида {% bx_component
 * 							name="bitrix:news.list"
 * 							template="main-page-list"
 * 							params={}
 * 							data={}
 * 							parent="@component"
 * 						%}
 * TODO: write new tag {% bx_asset_js  "path/to/file.js"  %}
 * TODO: write new tag {% bx_asset_css "path/to/file.css" %}
 */
function nunjucksBitrixComponentTag(env) {
	var environment = env;
	this.tags = ['bx_component'];
	this.parse = function(parser, nodes, lexer) {
		// get the tag token
		var tok = parser.nextToken();
		var args = parser.parseSignature(null, true);
		if (args.children.length == 0) {
			args.addChild(new nodes.Literal(0, 0, ""));
		}
		parser.advanceAfterBlockEnd(tok.value);
		return new nodes.CallExtension(this, tok.value, args, []);
	};
	this.bx_component = function(context, args) {
		var nunjucks = nunjucksRender.nunjucks;
		var typeof_name = typeof(args.name);
		if( 'string' != typeof(args.name) ) {
			throw 'component name not set';
		}
		if( 'string' != typeof(args.template) ) {
			if( 'string' != typeof(args.tpl) ) {
				//throw 'component template not set';
				args.tpl = '.default';
			}
			args.template = args.tpl;
		}
		args.parent = (typeof(args.parent) !== 'string') ? '' : args.parent;
		var name = args.name.replace(/:/, '/');
		var template = (args.template.length < 1) ? '.default' : args.template;
		var parent = '';
		if( 'string' == typeof(args.parent) && args.parent.length > 0 ) {
			parent = args.parent+'/';
		}
		var page = 'template';
		if( 'string' == typeof(args.complex_page) ) page = args.complex_page;
		if( 'string' == typeof(args.cmpx_page) ) page = args.cmpx_page;
		if( 'string' == typeof(args.cmp_page) ) page = args.cmp_page;
		if( 'string' == typeof(args.cpx_page) ) page = args.cpx_page;
		if( 'string' == typeof(args.page) ) page = args.page;
		var ctx = extend({}, context.ctx);
		ctx.templateUrl = '@components/'+parent+name+'/'+template;
		ctx.templatePath = ctx.templateUrl.replace(/@components/, 'components');
		ctx.templateFolder = ( typeof(ctx.CMP_BASE) != 'undefined' )
								? ctx.templateUrl.replace(/@components/, ctx.CMP_BASE)
								: ctx.templatePath;
		var templateFilePath = ctx.templatePath+'/'+page+'.njk';
		if( ! fs.existsSync(templateFilePath) ) {
			throw 'bx_component error: component "'+name+'/'+template+'" template file not found'
				+' ('+templateFilePath+')';
		}
		if(null === htmlTaskCurrentFile) {
			throw 'bx_component error: current nunjucks template unknown';
		}

		var addAsset = function(assetStore, assetName, isMinified, fileName, fileNameMin) {
			isMinified = !!isMinified;
			var fileExists = false;
			var fileExistsMark = '[-]';
			var fileUrl = ctx.templateUrl+'/'+(isMinified ? fileNameMin : fileName);
			var fileHref = fileUrl.replace(/@components/,
				( typeof(ctx.CMP_BASE) != 'undefined' )
				? ctx.CMP_BASE : 'components'
			);
			var filePath = ctx.templatePath+'/'+(isMinified ? fileNameMin : fileName);
			if( typeof(assetStore[htmlTaskCurrentFile]) == 'undefined' ) {
				assetStore[htmlTaskCurrentFile] = [];
			}

			if( isMinified ) {
				if( assetStore[htmlTaskCurrentFile].indexOf(fileHref) != -1 ) {
					return;
				}
				if( fs.existsSync(filePath) ) {
					fileExists = true;
					fileExistsMark = '[+]';
				}
				else {
					debugger;
					fileUrl = ctx.templateUrl+'/'+fileName;
					fileHref = fileUrl.replace(/@components/,
						( typeof(ctx.CMP_BASE) != 'undefined' )
						? ctx.CMP_BASE : 'components'
					);
					filePath = ctx.templatePath+'/'+fileName;
					if( assetStore[htmlTaskCurrentFile].indexOf(fileHref) != -1 ) {
						return;
					}
					if( fs.existsSync(filePath) ) {
						fileExists = true;
						fileExistsMark = '[~]';
					}
				}
			}
			else {
				if( assetStore[htmlTaskCurrentFile].indexOf(fileHref) != -1 ) {
					return;
				}
				if( fs.existsSync(filePath) ) {
					fileExists = true;
					fileExistsMark = '[+]';
				}
			}

			if( conf.html.bx_component.debug_assets ) gutil.log(gutil.colors.blue(
				'bx_component asset '+assetName+(isMinified?'.min':'')+': '
				+fileExistsMark
				+' "'+fileUrl.replace(/@components\//, '')+'"'
				+' (in file '+htmlTaskCurrentFile+')'
			));
			if( fileExists ) {
				assetStore[htmlTaskCurrentFile].push(fileHref);
			}
		};

		addAsset(assetsJs, ' js', conf.html.bx_component.use_minified_js, 'script.js', 'script.min.js');
		addAsset(assetsCss, 'css' ,conf.html.bx_component.use_minified_css, 'style.css', 'style.min.css');

		// add params and data
		if( typeof(args.params) !== 'undefined' ) {
			ctx.params = extend({}, args.params);
		}
		if( typeof(args.data) !== 'undefined' ) {
			ctx.data = extend({}, args.data);
		}

		// render bx_component
		var templateFileContent = fs.readFileSync(
			conf.curDir+'/'+templateFilePath, {encoding: 'utf8'}
		);
		templateFileContent = templateFileContent.replace(
			/(parent=['"])(@component)(['"])/,
			'$1'+name+'/'+template+'$3'
		);
		if( conf.debug ) {
			//gutil.log('Render componnt file: '+templateFilePath);
		}
		return new nunjucks.runtime.SafeString(
			nunjucksEnvironment.renderString(templateFileContent, ctx)
		);
	};
}

/**
 * Обработка скриптов
 * @task {js}
 * @order {5}
 */
//gulp.task('js', ['js-bundle', 'js-scripts', 'js-vendor-bundle']);
gulp.task('js', function(done) {
	runSequence(['js-bundle', 'js-scripts', 'js-vendor-bundle'], done);
});
/**
 * Выделяем встроенный sourcemap browserify в отдельный файл
 * Этот обработчик передается в .pipe(tap(...))
 * https://github.com/thlorenz/exorcist
 * https://github.com/thlorenz/convert-source-map
 *
 * Ещё можно попробовать это https://www.npmjs.com/package/gulp-extract-sourcemap
 * ну... да пускай будет как есть.
 *
 * @param bundleDir
 * @returns {Function}
 */
function tapExternalizeBroserifySourceMap(bundleDir) {
	return function(file) {
		var mapFileName = path.basename(file.path)+'.map';
		var mapFilePath = conf.curDir+'/'+bundleDir+'/'+mapFileName;
		var src = file.contents.toString();
		var converter = convertSourceMap.fromSource(src);
		fs.writeFileSync(mapFilePath, converter
			.toJSON()
			.replace(new RegExp(''+conf.curDir+'/', 'gim'), '../')
		);
		file.contents = new Buffer(
			convertSourceMap.removeComments(src).trim()
			+ '\n//# sourceMappingURL=' + path.basename(mapFilePath)
		);
	};
}
/**
 * Сборка скриптов из src в bundle
 * @task {js-bundle}
 * @order {7}
 */
gulp.task('js-bundle', function() {
	var stream = merge();
	var bundleDir = path.dirname(conf.js.bundle.out);
	console.log('bundleDir', bundleDir);
	stream.add(gulp.src(conf.js.bundle.src, {dot: true, base: '.'})
		.pipe(conf.debug ? debug({title: 'js bundle src:'}) : gutil.noop())
		.pipe(plumber())
		.pipe(tap(function(file) {
			var  bundleSrcFile = getRelPathByChanged(file)
				,bundleName = path.basename(bundleSrcFile)
					.replace(/^_/, '')
					.replace(/\.js$/, '')
				,bundleFile = path.basename(conf.js.bundle.out)
					.replace( /\*/, bundleName )
				;
			//gutil.log(bundleName+': '+gutil.colors.blue(bundleDir+'/'+bundleFile));
			if(bundleName == 'vendor') {
				gutil.log(gutil.colors.bgRed(
					'Bundle name "vendor" was reserved. Please rename file "'+bundleSrcFile+'"'
				));
			}
			else {
				stream.add(jsScriptsCommonStreamHandler(
					(
						gulp.src(bundleSrcFile, {dot: true, base: '.', read: false})
						.pipe(plumber())
						.pipe(browserify({
							debug: true

						}))
						.on('error', swallowError)
						.pipe(rename(bundleFile))
						.pipe(tap(tapExternalizeBroserifySourceMap(bundleDir)))
						.pipe(gulp.dest(bundleDir))
					),
					bundleDir,
					conf.debug ? 'js-bundle "'+bundleName+'":' : ''
				));
			}
		}))
	);
	return stream;
});

/**
 * Сборка сторонних библиотек в bundle
 * @task {js-vendor-bundle}
 * @order {8}
 */
gulp.task('js-vendor-bundle', function() {
	var stream = merge()
		,bundleDir = path.dirname(conf.js.vendor.out)
		,bundleFile = path.basename(conf.js.vendor.out);
	return jsScriptsCommonStreamHandler(
		(
			gulp.src(conf.js.vendor.src, {dot: true, base: '.', read: false})
			.pipe(plumber())
			.pipe(browserify({
				debug: true
				,shim: conf.js.vendor.shim
			}))
			.on('error', swallowError)
			.pipe(rename(bundleFile))
			.pipe(tap(tapExternalizeBroserifySourceMap(bundleDir)))
			.pipe(gulp.dest(bundleDir))
		),
		bundleDir,
		conf.debug ? 'vendor-bundle:' : ''
	);
	return stream;
});

/**
 * Обработка всех файлов скриптов
 * @task {js-scripts}
 * @order {6}
 */
gulp.task('js-scripts', function() {
	return jsScriptsCommonStreamHandler(
		gulp.src(conf.js.scripts, {dot: true, base: '.'}),
		'.',
		conf.debug ? 'js-script:' : ''
	);
});
function jsScriptsCommonStreamHandler(stream, dest, debugTitle) {
	var debugMode = true;
	if( 'string' != typeof(debugTitle)
		|| '' == debugTitle
	) {
		debugMode = false;
	}
	return stream
		.pipe(plumber())
		.pipe(sourcemaps.init({loadMaps: true}))
		.pipe(uglify())
		.pipe(debugMode ? debug({title: debugTitle}) : gutil.noop())
		.pipe(rename({extname: '.min.js'}))
		.pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: '.' }))
		.pipe(gulp.dest(dest))
		.pipe(browserSyncStream())
		.on('end', onTaskEnd)
	;
}
function jsScriptsWatcher(changedFile) {
	var file = getRelPathByChanged(changedFile)
		,dest = path.dirname(file)
		,fileName = path.basename(file)
		,filterSrcMaps = filter('*.js.map', {restore: true})
		,fileStat = fs.lstatSync(changedFile.path)
	;
	if( fileStat.isDirectory() ) {
		return;
	}
	if(conf.debug) gutil.log(
		'js script: '+gutil.colors.blue(
			dest+'/{ '+fileName+' -> '+fileName.replace(/\.js/, '.min.js')+' }'
		)
	);
	return jsScriptsCommonStreamHandler(
		gulp.src(file), dest,
		false ? 'js-script watcher:' : ''
	);
}


/**
 * Сборка svg-иконок в иконочный шрифт (glyphicon)
 * @task {svg-icons-font}
 * @order {11}
 */
gulp.task('svg-icons-font', function() {
	var runTimestamp = Math.round(Date.now()/1000);
	var fontName = 'svgi';
	return gulp.src(conf.svgIconFont.src, {dot: true, base: '.'})
		.pipe(plumber())
		.pipe(iconfontCss({
			fontName: fontName
			,path: conf.svgIconFont.sass.template
			,targetPath: conf.svgIconFont.sass.result
			,fontPath: conf.svgIconFont.dest
			,cssClass: 'afonico'
		}))
		.pipe(iconfont({
			fontName: fontName
			,formats: conf.svgIconFont.formats
		}))
		.pipe(gulp.dest(conf.svgIconFont.dest));
});

/**
 * Скачивание шрифтов с google-web-fonts
 * @task {google-web-fonts}
 * @order {12}
 */
gulp.task('google-web-fonts', function() {
	return gulp.src(conf.googleWebFonts.fontsList)
		.pipe(googleWebFonts({
			fontsDir: conf.googleWebFonts.fontsDir
			,cssDir: conf.googleWebFonts.cssDir
			,cssFilename: conf.googleWebFonts.cssFilename
		}))
		.pipe(gulp.dest(conf.googleWebFonts.dest));
});

/**
 * Оптимизация картинок в папке img.src/ и копирование
 * оптимизированных в images/
 * @task {images}
 * @order {9}
 */
gulp.task('images', function() {
	return gulp.src(conf.images.src, {dot: true})
		.pipe(conf.debug ? debug({title: 'optimizing image:'}) : gutil.noop())
		.pipe(imagemin())
		.pipe(gulp.dest(conf.images.dest))
		.on('end', onTaskEnd)
		.pipe(browserSyncStream());
});

/**
 * Собрать картинки и стили спрайтов
 * @task {sprites}
 * @order {10}
 */
gulp.task('sprites', function(done) {
	var resultStream = merge();
	// нам над достать миксины из первого спрайта и положить в отдельный файл
	var spriteBatchCounter = 0;
	// перебираем все спрайтсеты
	getSpriteBatchList().forEach(function(spriteBatch) {
		var filterSpriteImg = filter('*.png', {restore: true})
			,filterSass = filter('*.scss', {restore: true});
		spriteBatch.stream
			.pipe(conf.debug ? debug({title: 'sprite "'+spriteBatch.name+'" image:'}) : gutil.noop())
			// Компилируем спрайты
			.pipe(spritesmith({
				imgName: spriteBatch.name+'.png'
				,imgPath: conf.sprites.imgUrl+'/'+spriteBatch.name+'.png'
				,cssName: spriteBatch.name+'.scss'
				,cssVarMap: function (sprite) {
					sprite.name = 'sprite-'+spriteBatch.name+'-' + sprite.name;
				}
			}))
			// Убираем из sass файлов лишнее и выделяем миксины в отдельный файл
			.pipe(tap(function(file) {
				if(path.extname(file.path) === '.scss') {
					var fileContent = file.contents.toString();
					// удаление коментариев из файла
					fileContent = fileContent.replace(/^\/\/(.*)/gmi, '');
					fileContent = fileContent.replace(/\/\*[\s\S]*?\*\/\n?/gmi, '');

					// получаем миксины для размещения в отдельном файле
					// берем только один раз из первого спрайта
					// как это провернуть написано тут:
					// https://github.com/gulpjs/gulp/blob/master/docs/recipes/make-stream-from-buffer.md
					// и сделано по аналогии
					if(0 == spriteBatchCounter) {
						var matches = fileContent.match(/^@mixin\ssprites?(?:\(|-)[\s\S]*?\n}/gmi)
							,mixinsContent = '';
						matches.forEach(function(text) {
							mixinsContent += text+'\n';
						});
						var sassMixinsFileName = path.basename(conf.sprites.dest.sassMixins)
							,sassMixinsDir = path.dirname(conf.sprites.dest.sassMixins)
							,sassMixinsSpriteStream = vsrc(sassMixinsFileName)
							,sassMixinsSpriteStreamEnd = sassMixinsSpriteStream
						;
						sassMixinsSpriteStream.write(mixinsContent);
						process.nextTick(function() {
							sassMixinsSpriteStream.end();
						});

						sassMixinsSpriteStream
							.pipe(conf.debug ? debug({title: 'spriteBatch sass mixin:'}) : gutil.noop())
							.pipe(vbuf())
							.pipe(gulp.dest(sassMixinsDir))
						;
						resultStream.add(sassMixinsSpriteStream);
					}

					// remove all except sass-vars
					fileContent = fileContent.replace(/^[^\n$](.*)/gmi, '');
					//rename @spritesheet -> @spritesheet-{spriteBatch.name}
					fileContent = fileContent.replace(/\$spritesheet/gmi, '\$spritesheet-'+spriteBatch.name);
					// remove spaces
					fileContent = fileContent.replace(/\n\n/gmi, '');
					file.contents = new Buffer(fileContent, 'utf-8');
					spriteBatchCounter++;
				}
			}))
			.pipe(filterSpriteImg)
			.pipe(gulp.dest(conf.sprites.dest.img))
			//.pipe((!conf.sprites.minify)?gutil.noop():imagemin()) - падает с ошибкой
			.pipe((!conf.sprites.minify)?gutil.noop():tap(function(file) {
				// берем уже сохраненный файл в новый стрим
				var relFilePath = getRelPathByChanged(file)
					,destDir = path.dirname(relFilePath)
				return gulp.src(relFilePath, {dot: true})
					.pipe(imagemin())
					.pipe(gulp.dest(destDir))
			}))
			.pipe(filterSpriteImg.restore)
			.pipe(filterSass)
			.pipe(gulp.dest(conf.sprites.dest.sass))
			.pipe(filterSass.restore)
			.pipe(browserSyncStream())
		;
		resultStream.add(spriteBatch.stream);
	});
	return resultStream;
});

var spriteBatchNames = null;
// Функция возвращает названия директорий в папке со спрайтами
// Каждая директория - отдельный sprite set
function getSpriteBatchNames() {
	if(null == spriteBatchNames) {
		var spritesDir = conf.curDir+'/'+conf.sprites.src;
		var dirItems = fs.readdirSync(spritesDir);
		spriteBatchNames = [];
		dirItems.forEach(function(item) {
			var stat = fs.lstatSync(spritesDir+'/'+item);
			if( stat.isDirectory() ) {
				spriteBatchNames.push(item);
			}
			return true;
		});
	}
	return spriteBatchNames;
}

var spriteBatchList = null;
// Функция возвращает массив sprite set'ов с названием и stream'ом
function getSpriteBatchList() {
	if( null != spriteBatchList ) return spriteBatchList;
	var spriteBatchNames = getSpriteBatchNames();
	if( spriteBatchNames.length > 0 ) {
		spriteBatchList = [];
		spriteBatchNames.forEach(function(batchName) {
			spriteBatchList.push({
				name: batchName
				,stream: gulp.src(conf.sprites.src+'/'+batchName+'/*.png')
			});
		});
	}
	return spriteBatchList;
}


/**
 * Задача переписывает значения bower-файлов устанавливаемых пакетов
 * в соответствие с данными блока overrides основного bower-файла проекта
 * @ task {bower}
 */
gulp.task('bower', function() {
// 	var bowerMainFiles = require('main-bower-files');
// 	console.log(bowerMainFiles());
// 	var bowerOverrides = require('gulp-bower-overrides');
// 	return gulp.src('bower_components/*/bower.json')
// 		.pipe(bowerOverrides())
// 		.pipe(gulp.dest('bower_components'))
// 	;
});


/**
 * Собрать проект. Собирает стили, js-файлы и html-файлы.
 * Спрайты, загрузка шрифтов, созание иконочных шрифтов этой задачей на затрагиваются и должны быть запущены явно.
 * @task {build}
 * @order {1}
 */
gulp.task('build', function(done) {
	// Все последовательно, параллельность тут все равно не дает скорости
	runSequence(
		'sass-main',
		'css-bundle',
		'sass-components',
		'js-bundle',
		'js-scripts',
		'js-vendor-bundle',
		'--html-nunjucks',
		done
	);
});

/**
 * Запуск интерактивного режима с наблюдением за файлами
 * и пересборкой при изменении, но без запуска веб-сервера
 * @task {watch}
 * @order {13}
 */
var watchers = [];
const WATCH_OPTIONS = {cwd: './'};
gulp.task('watch', function(done) {
	isInteractiveMode = true;
	console.log('watchers', watchers);
	if( watchers.length > 0 ) {
		runSequence('remove-watchers', 'css-bundle-parse-imports-list', 'add-watchers', 'watch-hotkeys', done);
	}
	else {
		runSequence('css-bundle-parse-imports-list', 'add-watchers', 'watch-hotkeys', done);
	}
});
gulp.task('add-watchers', function (done) {
	console.log('add-watchers');
	watchers.push(gulp.watch(conf.html.watch, WATCH_OPTIONS, ['html']));
	watchers.push(gulp.watch(conf.sass.main.watchImports, ['sass-main-bundle']));
	watchers.push(gulp.watch(conf.sass.main.bundle, WATCH_OPTIONS, ['css-bundle']));
	watchers.push(gulp.watch(conf.sass.main.files, WATCH_OPTIONS, function(changed) {
		return sassWatcher(changed, 'main');
	}));
	watchers.push(gulp.watch(conf.sass.components.watch, WATCH_OPTIONS, function(changed) {
		return sassWatcher(changed, 'components');
	}));
	watchers.push(gulp.watch(conf.js.bundle.watch, WATCH_OPTIONS, ['js-bundle']));
	watchers.push(gulp.watch(conf.js.vendor.src, WATCH_OPTIONS, ['js-vendor-bundle']));
	watchers.push(gulp.watch(conf.js.scripts, WATCH_OPTIONS, function(changed) {
		return jsScriptsWatcher(changed);
	}));
	done();
});
gulp.task('remove-watchers', function(done) {
	watchers.forEach(function(watcher, index) {
		watcher.end();
	});
	watchers = [];
	done();
});
/**
 * Слежение за горячими клавишами.
 * Подсказка по горячим клавишам: $ gulp help-hk | sass
 * @task {watch-hotkeys}
 * @order {16}
 */
gulp.task('watch-hotkeys', function() {
	isInteractiveMode = true;
	var keyListener = new KeyPressEmitter();

	function beginInteractiveModeTaskAction() {
		isInteractiveMode = false;
		switchBroserSync(false);
	}
	function finishInteractiveModeTaskAction() {
		isInteractiveMode = true;
		switchBroserSync(true);
		browserSyncReload();
	}

	keyListener.on('showHotKeysHelp', function() {
		runSequence('help-hk');
	});
	keyListener.on('showHelp', function() {
		runSequence('help');
	});
	keyListener.on('reloadWatchers', function() {
		if( watchers.length > 0 ) {
			runSequence('remove-watchers', 'add-watchers');
		}
		else {
			runSequence('add-watchers');
		}
	});
	keyListener.on('removeWatchers', function() {
		runSequence('remove-watchers');
	});
	keyListener.on('buildHtml', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'html', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildAllStyles', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'sass-main', 'sass-components', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildMainStyles', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'sass-main', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildMainStylesAndBundle', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'sass-main-bundle', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildAllStylesAndBundle', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'sass', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildComponentStyles', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'sass-components', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildCssBundle', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'css-bundle', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildJs', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'js', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildJsScripts', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'js-scripts', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildJsBundle', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'js-bundle', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildJsVendorBundle', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'js-vendor-bundle', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('optimizeImages', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'images', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildSprites', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'sprites', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('buildCsvIconsFont', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'svg-icons-font', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('downloadGoogleWebFonts', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'google-web-fonts', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('switchDebugMode', function() {
		conf.debug = !conf.debug;
		gutil.log(gutil.colors.blue('Debug mode switched to "'+(conf.debug?'true':'false')+'"'))
	});
	keyListener.on('switchProductionMode', function() {
		conf.production = !conf.production;
		gutil.log(gutil.colors.blue('Production mode switched to "'+(conf.production?'true':'false')+'"'))
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'html', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('reloadAll', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'sass-components', 'js-scripts', 'html', 'add-watchers', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.on('build', function() {
		beginInteractiveModeTaskAction();
		runSequence('remove-watchers', 'build', 'add-watchers', finishInteractiveModeTaskAction);
	});
	keyListener.start();
});
gulp.task('keys-debug', function() {
	isInteractiveMode = true;
	var keyListener = new KeyPressEmitter();
	keyListener.debug = true;
	keyListener.start();
});

const EventEmitter = require('events').EventEmitter;
class KeyPressEmitter extends EventEmitter {

	constructor() {
		super();
		this._debug = false;
	}

	start() {
		//process.stdin.setEncoding('utf8');
		process.stdin.setRawMode(true);
		const keyAlt = '\u001b';
		const key_w = '\u0017';
		// sequences tested in linux
		const sequence_ctrl_alt_w = keyAlt+key_w;
		const sequence_ctrl_r = '\u0012';
		const sequence_ctrl_l = '\t';
		const sequence_ctrl_s = '\u0013';
		const _this = this;
		process.stdin.on('data', function(data) {
			const key = decodeKeypress(data);

			if( ( false === key.shift && key.name == 'q')
				|| (key.ctrl && key.name === 'c')
			) {
				process.exit();
			}
			if(_this.debug) {
				console.log('decode keypress\n', key, data.toString());
			}
			else if( key.sequence == '\r' ) {
				console.log();
			}

			if( key.name == 'f1' && false === key.shift
				&& false === key.ctrl && false === key.meta
			) {
				gutil.log('Hot key [F1]: Show hot keys help');
				_this.emit('showHotKeysHelp');
			}
			else if( key.name == 'f2' && false === key.shift
				&& false === key.ctrl && false === key.meta
			) {
				gutil.log('Hot key [F2]: Show help');
				_this.emit('showHelp');
			}
			else if( true === key.shift && key.name == 'w' ) {
				gutil.log('Hot key [Shift+w]: Remove watchers');
				_this.emit('removeWatchers');
			}
			else if( false === key.shift && key.name == 'w' ) {
				gutil.log('Hot key [w]: Reload watchers');
				_this.emit('reloadWatchers');
			}
			else if( false === key.shift && key.name == 'h' ) {
				gutil.log('Hot key [h]: Build html');
				_this.emit('buildHtml');
			}
			else if( true === key.shift && key.name == 's' ) {
				gutil.log('Hot key [Shift+s]: Build main styles and bundle');
				_this.emit('buildMainStylesAndBundle');
			}
			else if( false === key.shift && key.name == 's' ) {
				gutil.log('Hot key [s]: Build main styles (w/o -bundle)');
				_this.emit('buildMainStyles');
			}
			else if( true === key.shift && key.name == 'a' ) {
				gutil.log('Hot key [Shift+a]: Build all styles (main + bundle + components)');
				_this.emit('buildAllStylesAndBundle');
			}
			else if( false === key.shift && key.name == 'a' ) {
				gutil.log('Hot key [Shift+a]: Build all styles (main + components)');
				_this.emit('buildAllStyles');
			}
			else if( true === key.shift && key.name == 'l' ) {
				gutil.log('Hot key [Shift+l]: Build obly bundle of main styles');
				_this.emit('buildCssBundle');
			}
			else if( false === key.shift && key.name == 'l' ) {
				gutil.log('Hot key [l]: Build component styles');
				_this.emit('buildComponentStyles');
			}
			else if( false === key.shift && key.name == 'j' ) {
				gutil.log('Hot key [j]: Build js-bundle');
				_this.emit('buildJsBundle');
			}
			else if( true === key.shift && key.name == 'j' ) {
				gutil.log('Hot key [Shift+j]: Build js-vendor-bundle');
				_this.emit('buildJsVendorBundle');
			}
			else if( false === key.shift && key.name == 'k' ) {
				gutil.log('Hot key [k]: Build js-scripts (w/o bundles)');
				_this.emit('buildJsScripts');
			}
			else if( true === key.shift && key.name == 'k' ) {
				gutil.log('Hot key [Shift+k]: Build js-scripts and all bundles');
				_this.emit('buildJs');
			}
			else if( key.shift && key.name == 'i' && key.sequence == 'I' ) {
				gutil.log('Hot key [Shift+i]: Build sprites');
				_this.emit('buildSprites');
			}
			else if( false === key.shift && key.name == 'i' && key.sequence == 'i' ) {
				gutil.log('Hot key [i]: Optimize images');
				_this.emit('optimizeImages');
			}
			else if( false === key.shift && key.name == 'f' ) {
				gutil.log('Hot key [f]: Build csv-icons-font');
				_this.emit('buildCsvIconsFont');
			}
			else if( false === key.shift && key.name == 'g' ) {
				gutil.log('Hot key [g]: Download goole-web-fonts');
				_this.emit('downloadGoogleWebFonts');
			}
			else if( key.shift && key.name == 'd' && key.sequence == 'D' ) {
				gutil.log('Hot key [Shift+d]: Switch debug mode');
				_this.emit('switchDebugMode');
			}
			else if( key.shift && key.name == 'p' && key.sequence == 'P' ) {
				gutil.log('Hot key [Shift+p]: Switch debug mode');
				_this.emit('switchProductionMode');
			}
			else if( false === key.shift && key.name == 'r' ) {
				gutil.log('Hot key [r]: Reload all (almost for components)');
				_this.emit('reloadAll');
			}
			else if( false === key.shift && key.name == 'b' ) {
				gutil.log('Hot key [b]: Full build');
				_this.emit('build');
			}
			// TODO: Дописать запуск разных задач, которые отсутствуют в watcher-ах типа спрайтов, картинок и пр.
		});
	}

	set debug(value) {
		this._debug = !!value;
	}
	get debug() {
		return this._debug;
	}
}

function showHelpHotKeys(done) {
	console.log(`
    Горячие клавиши как правло не содержат нажатий Ctrl или Alt
    и срабатывают при нажатии непосредственно на одну целевую клавишу.
    Будте аккуратны :)

        "F1" - Вывести эту справку

        "q" - Выход. Завершает интерактивный режим (watch|layout).
 "Ctrl + c" - То же что "q"

        "w" - Перезагрузить watcher-ы. Это актуально потому, что gulp.watch()
                не очень правильно обрабатывает добавление или удаление
                файлов. Что порождает очень большую возьню с правильными glob-шаблонами,
                которые будут корректно отрабатывать. Более того, используемая в Битриксе практика
                именовать папки начиная с точки "." вообще исключает корректную работу.
              Потому иногда надо просто перегрузить watcher-ы и вновь добавленные файлы будут учтены.

"Shift + w" - Удалить watcher-ы,
                Дабы произвести удаление или перемещение файлов и папок.
                Это убережет процесс интерактивного режима от падения
                в результате обращения watcher-ов к уже отсутствующим на ФС элементам.
                Для повторного запуска нажимите "w".

        "r" - Более масштабная перегрузка watcher-ов включающая пересборку html, sass и js
              Это необходимо например потому, что тот же html зависит от состава файлов css-bundle-а.
              При создании новых компонентов и шаблонов необходимо использовать именно этот вариант.

"Shift + d" - Переключить debug-mode в противоположный.
              Так же уравляется ключем. $ gulp some-task --debug

"Shift + p" - Переключить production-mode.
              Так же управляется ключем. $ gulp some-task --production

        "h" - Сборка njk-файлов в html. Аналог $ gulp html

        "s" - Сборка основных стилей.
              Аналог $ gulp sass-main
"Shift + s" - Сборка основных стилей и их bundle-а
              Аналог $ gulp sass-main-bundle

        "a" - Сборка всех стилей (но без сборки bundle-а).
              Аналог $ gulp sass-main && gulp sass-components
"Shift + a" - Полный сборка всех стилей: компоненты, основные стили + bundle.
              Аналог $ gulp sass

        "l" - Соберет только sass-файлы компонентов (component/ns/name/tpl/style.scss).
              Аналог $ gulp sass-components

"Shift + l" - Сборка только css-bundle-а.
              Аналог $ gulp css-bundle

        "j" - Сборка js-bundle(ов)
              Аналог $ gulp js-bundle
              из js/src/_<bundle_name>.js -> js/bundle.<bundle_name[.min].js
              Как bundle один js/src/_index.js -> js/bundle.index[.min].js
              <bundle_name> не может значение "vendor"
"Shift + j" - Сборка js-vendor-bundle(а)
              Аналог $ gulp js-vendor-bundle
              из js/vendor/_bundle.js -> js/bundle.vendor[.min].js

        "k" - Обработка всех скриптов кроме js-bundle-ов.
              Чаще всего используется для файлов script.js в компонентах
              Аналог $ gulp js-scripts
"Shift + k" - Полная обработка js-файлов в т.ч. создание js-bundle-ов
              Аналог $ gulp js

        "i" - Минификация картинок в папке img.src/ с перемещением в images/
              Аналог $ gulp images

"Shift + i" - Производит сборку спрайтов.
              Аналог $ gulp sprites

        "f" - Сборка svg-файлов в иконочный шрифт
              Аналог $ gulp svg-icons-font

        "g" - Загрузка шрифтов google-web-fonts (fonts.google.com)
              Аналог $ gulp google-web-fonts
              Загрузка повлечет за собой создание sass-файлов, на которые
              настроен watcher, соответственно будут пересобраны все sass-файлы $ gulp sass

        "b" - Полная сборка проекта. Аналог $ gulp build

`);
	done();
}
/**
 * Вывести справки по горячим клавишам интерактивного режима
 * @task {help-hk}
 * @order {17}
 */
gulp.task('help-hk', showHelpHotKeys);
gulp.task('help-hotkeys', showHelpHotKeys);



/**
 * Запустить разработку вёрстки в интерактивном режиме.
 * (Слежение за файлами + встроенный веб-сервер с автоматической перезагрузкой)
 * @task {layout}
 * @order {14}
 */
gulp.task('layout', function(done) {
	//runSequence('build', 'watch', 'run-browser-sync');
	runSequence('watch', 'run-browser-sync');
	done();
});


/**
 * Запустить разработку в режиме проксирования
 * виртуального хоста веб-сервера php. Удобно для тестирования
 * на мобильных устройствах, поскольку редко удается быстро настроить
 * wifi роутер для обработки доменов виртуальных хостов на машине разработчика.
 * Соответственно имеет смысл прокировать на отдельный порт localhost-а
 * @task {phpdev}
 * @order {15}
 */
gulp.task('phpdev', function(done) {
	//runSequence('build', 'watch', 'run-lamp-proxy');
	runSequence('watch', 'run-lamp-proxy');
	done();
});


gulp.task('run-browser-sync', function() {
	browserSync.init(conf.browserSync);
});

gulp.task('run-lamp-proxy', function() {
	browserSync.init({
		proxy: conf.proxyLamp,
		port: '8008',
		open: false
	});
});

gulp.task('default', ['help']);
gulp.task('help', function () {
	return helpDoc(gulp, {
		lineWidth: 120,
		keysColumnWidth: 20,
		logger: console
	})
});

//////////////////////////
}; // end main function //
//////////////////////////
