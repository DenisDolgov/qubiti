'use strict';
/**
 * Сборщик верстки для шаблонов Битрикс
 * 
 * известные баги:
 * 1. Если в компонентах нет ни одного файла style.less, то таск по сборке стилей будет падать
 * 2. При удалении файлов в интерактивном режиме, сервер скорее всего упадет.
 *    Просто заново запускаем и не забиваем себе голову.
 */

module.exports = function(currentTemplateDir) {

/** @const */
const
	 fs = require('fs')
	,extend = require('extend')
	,path = require('path')
	,gulp = require('gulp')
	,decodeKeypress = require('decode-keypress')
	,del = require('del')
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
	,less = require('gulp-less')
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

var conf = {
	//noinspection JSUnresolvedVariable
	curDir: currentTemplateDir
	,debug: false
	,production: false
	,browserSync: {
		server: './'
		,index: '/index.html'
		,open: false
		,proxyLamp: 'default.loc'
	}
	,html: {
		base: 'pages'
		,pages: [
			'@base/**/*.njk'
			,'!@base/**/_*.njk'
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
			 use_minified_js: true //!!gutil.env.production
			,use_minified_css: true //!!gutil.env.production
			,debug_assets: !!gutil.env['debug-bx-assets']
		}
	}
	,less: {
		main: {
			 base: 'less'
			,dest: 'css'
			,bundle: '@base/_bundle.css'
			,files: [
				'@base/**/*.less'

				// Исключаем файлы с переменными less
				,'!@base/**/var{,s,iable{,s}}{,.*,-*}{,/*,/**/*}.less'

				// исключаем twitter bootstrap (но только подпапки))
				// файлы именыемые bootstrap*.less не исключаем
				// для возможности отдельной сборки
				,'!@base/**/bootstrap{,.*,-*}{/*,/**/*}.less'

				// Исключаем файлы и папки начинающие с подчеркивания.
				//    Будем применять их для импортируемых файлов
				//    без возможности автономной компиляции
				,'!@base/**/_*{,/*,/**/*}.less'

				// Исключаем библиотеки миксинов less
				,'!@base/**/mixin{,s}{,.*,-*}{,/*,/**/*}.less'
				,'!@base/**/lib{,s,rary{,s}}{,.*,-*}{,/*,/**/*}.less'
			]
			,watchImports: [
				 // Это те файлы библиотек при которых пересобираем все несущие less-файлы
				 // смотри исключения в conf.less.main.files
				 '@base/var{,s,iable{,s}}{,.*,-*}{,/*,/**/*}.less'
				,'@base/bootstrap{,.*,-*}{/*,/**/*}.less'
				,'@base/_*{,/*,/**/*}.less'
				,'@base/mixin{,s}{,.*,-*}{,/*,/**/*}.less'
				,'@base/lib{,s,rary{,s}}{,.*,-*}{,/*,/**/*}.less'
				// При изменении файлов входящих в src пересобираем файлы по одному
				// Дабы браузер быстрее реагировал в режиме разработки
			]
		}
		,components: {
			 styleName: 'style.less'
			,files: [
				 'components/*/*/{*,.*}/@styleName'
				,'components/*/*/{*,.*}/*/*/{*,.*}/@styleName'
			]
			,watch: [
				 'components/*/*/**/*.less'
				,'components/*/*/{*,.*}/**/*.less'
				,'components/*/*/{*,.*}/*/*/{*,.*}/**/*.less'
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
// 				jquery: {
// 					path: 'js/vendor/jquery.js'
// 					,exports: 'jQuery'
// 				}
// 				,"jquery-mousewheel": {
// 					path: 'js/vendor/jquery.mousewheel/jquery.mousewheel.js'
// 					,exports: 'jqueryMousewheel'
// 				}
// 				,doT: {
// 					path: 'js/vendor/doT/doT.js'
// 					,exports: 'doT'
// 				}
			}
		}
		,scripts: [
			'js/**/*.js'
			,'!js/src/**/*.js'
			,'!js/bundle.*.js'
			,'!js/**/*{.,-}min.js'
			,'!js/vendor/**/*.js'
			
			,'components/*/*/**.js'
			,'components/*/*/{*,.*}/**/*.js'
			,'components/*/*/{*,.*}/*/*/{*,.*}/**/*.js'

			,'!components/*/*/{*,.*}/*{.,-}min.js'
			,'!components/*/*/{*,.*}/*/*/{*,.*}/*{.,-}min.js'
			,'!components/*/*/{*,.*}/vendor/**/*.js'
			,'!components/*/*/{*,.*}/*/*/{*,.*}/vendor/**/*.js'
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
			less: 'less/vars/sprites',
			lessMixins: 'less/mixins/sprites.less'
		}
	}
	,googleWebFonts: {
		fontsList: 'fonts/gwf/google-web-fonts.list' // relative to the site template root
		,fontsDir: '../fonts/gwf/' // fontsDir is relative to dest
		,cssDir: 'lib/' // cssDir is relative to dest
		,cssFilename: 'google-web-fonts.less'
		,dest: './less/'
	}
	,svgIconFont: {
		src: 'img.src/svgicons/**/*.svg'
		,formats: ['woff2', 'woff', 'ttf', 'eot', 'svg']
		,less: {
			template: 'img.src/svgicons/_less.tmpl'
			// result path is relative to dest folder i.e. fonts/svgicons in this case
			,result: '../../less/mixins/svgicons.less'
		}
		,dest: 'fonts/svgicons'
	}
};

extend(true, conf, require(conf.curDir+'/gulpfile.config.js'));
conf.debug = gutil.env.debug ? true : conf.debug;
conf.production = gutil.env.production ? true : conf.debug;

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
replacePlaceHolder(conf.less.main, {cond: /@base/, value: conf.less.main.base});
replacePlaceHolder(conf.less.components.files, {cond: /@styleName/, value: conf.less.components.styleName});

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
		throw 'Непонятный файл пришел от watch!: "'+changedFile.path+'"';
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


/**
 * Сборка less-файлов
 * @task {less}
 * @order {3}
 */
var cssBundleFiles = null;
gulp.task('less', ['less-main-bundle', 'less-components']);
gulp.task('less-main', function() {
	var stream = gulp.src(conf.less.main.files, {dot: true})
		.pipe(conf.debug ? debug({title: 'main less:'}) : gutil.noop());
	lessCommonPipe(stream, conf.less.main.dest);
	return stream;
});
gulp.task('less-main-bundle', function() {
	runSequence('less-main', 'css-bundle');
})
gulp.task('less-components', function() {
	var  stream =  merge();
	gulp.src(conf.less.components.files, {dot: true, base: '.'})
		.pipe(conf.debug ? debug({title: 'component less:'}) : gutil.noop())
		.pipe(tap(function(file) {
			var relFilePath = getRelPathByChanged(file)
				,dest = path.dirname(relFilePath)
				,streamFile = gulp.src(relFilePath, {dot: true});
			lessCommonPipe(streamFile, dest);
			stream.add(streamFile);
		}));
	return stream;
});
function lessCommonPipe(stream, dest) {
	stream.pipe(plumber())
		.pipe(sourcemaps.init())
		.pipe(less())
		// fix for stop watching on less compile error)
		.on('error', swallowError)
		//.pipe(autoprefixer())
		.pipe(gulp.dest(dest))
		.pipe(browserSync.stream())
		.pipe(rename({extname: '.min.css'}))
		.pipe(cssnano({zindex: false /*трудно понять зачем нужна такая фича, но мешает она изрядно*/}))
		.pipe(sourcemaps.write('./'))
		.pipe(gulp.dest(dest))
		.pipe(browserSync.stream())
		.on('end', onTaskEnd)
	;
}
function lessWatcher(changedFile, target) {
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
			stream = gulp.src(file, {dot: true, base: conf.less.main.base});
			stream.pipe(tap(function(file) {
				var filePath = file.path.replace(/\\/g, '/');
				var lessDir = conf.curDir+'/'+conf.less.main.base;
				var relLessFilePath = null;
				lessDir = lessDir
					.replace(/\\/g, '/')
					.replace(/\/\//g, '/');
				if(filePath.indexOf(lessDir) !== 0) {
                    console.log(lessDir, filePath, file.path);//IMakh_del
					throw 'lesscss file out of configured less dir: "'+filePath+'"';
				}
				relLessFilePath = conf.less.main.dest+'/'+substr(filePath, lessDir.length+1);
				relLessFilePath = relLessFilePath
					.trim()
					.replace(/\/\//g, '/')
					.replace(/\.less$/, '.css');
				if( null !== cssBundleFiles
					&& cssBundleFiles.indexOf(relLessFilePath) !== -1
				) {
					runSequence('css-bundle');
				}
			}))
			dest = conf.less.main.dest;
			if(conf.debug) gutil.log('less watcher: '+gutil.colors.blue(file));
			break;
		case 'components':
			dest = path.dirname(file);
			stream = gulp.src(dest+'/'+conf.less.components.styleName, {dot: true});
			if(conf.debug) gutil.log(
				'less watcher: '
				+gutil.colors.blue(dest+'/'
					+((fileName == conf.less.components.styleName)
						? '{ '+fileName+' -> '+fileName.replace(/\.less$/, '.css')+' }'
						: '{ '
							+'changed: '+fileName+';  compiling: '
							+conf.less.components.styleName +' -> '
							+conf.less.components.styleName.replace(/\.less$/, '.css')
							+' }'
					)
				)
			);
			break;
		default:
			throw 'less-watcher: wrong watcher target';
	}
	lessCommonPipe(stream, dest);
	return stream;
}

/**
 * Сборка css-bundle-а
 * @task {css-bundle}
 * @order {4}
 */
gulp.task('css-bundle', function() {
	var stream = new merge();
	cssBundleFiles = [];
	var cssBundleFilesImport = '';
	stream.add(gulp.src(conf.less.main.bundle)
		.pipe(conf.debug ? debug({title: 'css bundle:'}) : gutil.noop())
		.pipe(tap(function(file) {
			var bundleName = path.basename(file.path)
				.replace(/^_/, '')
				.replace(/\.(less|css)$/i, '');
			var relBundleFilePath = getRelPathByChanged(file);
			
			var regim = /\s*@import\s*['"]([a-zA-Z0-9_\-\/\.]+)(?:\.css|\.less)['"]\;\s*/gim;
			var rei = /\s*@import\s*['"]([a-zA-Z0-9_\-\/\.]+)(?:\.css|\.less)['"]\;\s*/i;
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
						cssBundleFiles.push(conf.less.main.dest+'/'+importedCssFile);
						cssBundleFilesImport +='@import "'+importedCssFile+'";\n';
					}
				}
			}

			if( cssBundleFilesImport.length > 0 ) {
				stream.add(gulp.src(relBundleFilePath, {dot: true})
					.pipe(rename(bundleName+'-import.css'))
					.pipe(tap(function(file) {
						file.contents = new Buffer(cssBundleFilesImport, 'utf-8');
					}))
					.pipe(gulp.dest(conf.less.main.dest))
				);
			}

			if(cssBundleFiles.length > 0) {
				stream.add(gulp.src(cssBundleFiles, {dot: true})
					.pipe(conf.debug ? debug({title: 'css bundle file:'}) : gutil.noop())
					.pipe(plumber())
					.pipe(sourcemaps.init({loadMaps: true}))
					.pipe(concat(bundleName+'.css'))
					.pipe(sourcemaps.write('./'))
					.pipe(gulp.dest(conf.less.main.dest))
					.pipe(tap(function(file) {
						var relFilePath = getRelPathByChanged(file);
						if(path.extname(relFilePath) === '.css') {
							var dest = path.dirname(relFilePath);
							stream.add(gulp.src(relFilePath)
								.pipe(sourcemaps.init({loadMaps: true}))
								.pipe(rename({extname: '.min.css'}))
								.pipe(cssnano({zindex: false}))
								.pipe(sourcemaps.write('./'))
								.pipe(gulp.dest(dest))
							);
						}
					}))
				);
			}
		}))
	);
	stream
		.pipe(browserSync.stream())
		.on('end', onTaskEnd)
	return stream;
});



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
		runSequence('css-bundle', 'html-nunjucks');
	}
	else {
		runSequence('html-nunjucks');
	}
	done();
});
gulp.task('html-nunjucks', function() {
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
		.on('end', function() { browserSync.reload(); })
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
gulp.task('js', ['js-bundle', 'js-scripts', 'js-vendor-bundle']);
//gulp.task('js', function() {
//	runSequence('js-bundle', ['js-scripts', 'js-vendor-bundle']);
//});
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
				stream.add(gulp.src(bundleSrcFile, {dot: true, base: '.', read: false})
					.pipe(plumber())
					.pipe(browserify({ debug: true }))
					.on('error', swallowError)
					.pipe(rename(bundleFile))
					.pipe(tap(tapExternalizeBroserifySourceMap(bundleDir)))
					.pipe(gulp.dest(bundleDir))
					.pipe(tap(function(file) {
						stream.add(jsScriptsWatcher(file));
					}))
				);
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
	stream.add(gulp.src(conf.js.vendor.src, {dot: true, base: '.', read: false})
		.pipe(plumber())
		.pipe(browserify({
			debug: true
			,shim: conf.js.vendor.shim
		}))
		.on('error', swallowError)
		.pipe(rename(bundleFile))
		.pipe(tap(tapExternalizeBroserifySourceMap(bundleDir)))
		.pipe(gulp.dest(bundleDir))
		.pipe(tap(function(file) {
			stream.add(jsScriptsWatcher(file));
		}))
	);
	return stream;
});

/**
 * Обработка всех файлов скриптов
 * @task {js-scripts}
 * @order {6}
 */
gulp.task('js-scripts', function() {
	var  stream =  merge();
	gulp.src(conf.js.scripts, {dot: true, base: '.'})
		.pipe(tap(function(file) {
			stream.add(jsScriptsWatcher(file));
		}))
	;
	return stream;
});
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
	return gulp.src(file)
		.pipe(plumber())
		.pipe(sourcemaps.init({loadMaps: true}))
		.pipe(uglify())
		.pipe(rename({extname: '.min.js'}))
		.pipe(sourcemaps.write('./'))
		.pipe(gulp.dest(dest))
		.pipe(browserSync.stream())
		.on('end', onTaskEnd)
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
			,path: conf.svgIconFont.less.template
			,targetPath: conf.svgIconFont.less.result
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
		.pipe(browserSync.stream());
});

/**
 * Собрать картинки и стили спрайтов
 * @task {sprites}
 * @order {10}
 */
gulp.task('sprites', function(done) {
	var resultStream = merge();
	// нам над достать миксины из первого сспрайта и положить в отдельный файл
	var spriteBatchCounter = 0;
	getSpriteBatchList().forEach(function(spriteBatch) {
		var filterSpriteImg = filter('*.png', {restore: true})
			,filterLess = filter('*.less', {restore: true});
		spriteBatch.stream
			.pipe(conf.debug ? debug({title: 'sprite "'+spriteBatch.name+'" image:'}) : gutil.noop())
			// Компилируем спрайты
			.pipe(spritesmith({
				imgName: spriteBatch.name+'.png'
				,imgPath: conf.sprites.imgUrl+'/'+spriteBatch.name+'.png'
				,cssName: spriteBatch.name+'.less'
				,cssVarMap: function (sprite) {
					sprite.name = 'sprite-'+spriteBatch.name+'-' + sprite.name;
				}
			}))
			// Убираем из less файлов лишнее и выделяем миксины в отдельный файл
			.pipe(tap(function(file) {
				if(path.extname(file.path) === '.less') {
					var fileContent = file.contents.toString();
					// remove line comments
					fileContent = fileContent.replace(/^\/\/(.*)/gmi, '');
					// remove multi line comments
					fileContent = fileContent.replace(/\/\*[\s\S]*?\*\/\n?/gmi, '');
					
					// получаем миксины для размещения в отдельном файле
					// берем только один раз из первого спрайта
					// как это провернуть написано тут:
					// https://github.com/gulpjs/gulp/blob/master/docs/recipes/make-stream-from-buffer.md
					// и сделано по аналогии
					if(0 == spriteBatchCounter) {
						var matches = fileContent.match(/^\.sprites?(?:\(|-)[\s\S]*?\n}/gmi)
							,mixinsContent = '';
						matches.forEach(function(text) {
							mixinsContent += text+'\n';
						});
						var lessMixinsFileName = path.basename(conf.sprites.dest.lessMixins)
							,lessMixinsDir = path.dirname(conf.sprites.dest.lessMixins)
							,lessMixinsSpriteStream = vsrc(lessMixinsFileName)
							,lessMixinsSpriteStreamEnd = lessMixinsSpriteStream
						;
						lessMixinsSpriteStream.write(mixinsContent);
						process.nextTick(function() {
							lessMixinsSpriteStream.end();
						});

						lessMixinsSpriteStream
							.pipe(conf.debug ? debug({title: 'spriteBatch less mixin:'}) : gutil.noop())
							.pipe(vbuf())
							.pipe(gulp.dest(lessMixinsDir))
						;
						resultStream.add(lessMixinsSpriteStream);
					}

					// remove all except less-vars
					fileContent = fileContent.replace(/^[^@](.*)/gmi, '');
					//rename @spritesheet -> @spritesheet-{spriteBatch.name}
					fileContent = fileContent.replace(/@spritesheet/gmi, '@spritesheet-'+spriteBatch.name);
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
			.pipe(filterLess)
			.pipe(gulp.dest(conf.sprites.dest.less))
			.pipe(filterLess.restore)
			.pipe(browserSync.stream())
		;
		resultStream.add(spriteBatch.stream);
	});
	return resultStream;
});

var spriteBatchNames = null;
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
function getSpriteBatchList() {
	if( null != spriteBatchList ) return spriteBatchList;
	if( getSpriteBatchNames().length > 0 ) {
		spriteBatchList = [];
		getSpriteBatchNames().forEach(function(batchName) {
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
 * Собрать проект
 * @task {build}
 * @order {1}
 */
gulp.task('build', function() {
	// less и js параллельно, а после html,
	// поскольку надо что бы был заполнена переменная
	// с именами (путями) файлов css-bundle-а
	runSequence(['less', 'js'], 'html');
});

/**
 * Запуск интерактивного режима с наблюдением за файлами
 * и пересборкой при изменении, но без запуска веб-сервера
 * @task {watch}
 * @order {13}
 */
var watchers = [];
const WATCH_OPTIONS = {cwd: './'};
gulp.task('watch', function() {
	if( watchers.length > 0 ) {
		runSequence('remove-watchers', 'css-bundle', 'add-watchers', 'watch-hotkeys');
	}
	else {
		runSequence('css-bundle', 'add-watchers', 'watch-hotkeys');
	}
});
gulp.task('add-watchers', function (done) {
	watchers.push(gulp.watch(conf.html.watch, WATCH_OPTIONS, ['html']));
	watchers.push(gulp.watch(conf.less.main.watchImports, WATCH_OPTIONS, ['less-main-bundle']));
	watchers.push(gulp.watch(conf.less.main.bundle, WATCH_OPTIONS, ['css-bundle']));
	watchers.push(gulp.watch(conf.less.main.files, WATCH_OPTIONS, function(changed) {
		return lessWatcher(changed, 'main');
	}));
	watchers.push(gulp.watch(conf.less.components.watch, WATCH_OPTIONS, function(changed) {
		return lessWatcher(changed, 'components');
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
 * Подсказка по горячим клавишам: $ gulp help-hk | less
 * @task {watch-hotkeys}
 * @order {16}
 */
gulp.task('watch-hotkeys', function() {
	var keyListener = new KeyPressEmitter();
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
		runSequence('html');
	});
	keyListener.on('buildStyles', function() {
		runSequence('less');
	});
	keyListener.on('buildComponentStyles', function() {
		runSequence('less-components');
	});
	keyListener.on('buildCssBundle', function() {
		runSequence('css-bundle');
	});
	keyListener.on('buildJs', function() {
		runSequence('js');
	});
	keyListener.on('buildJsScripts', function() {
		runSequence('js-scripts');
	});
	keyListener.on('optimizeImages', function() {
		runSequence('images');
	});
	keyListener.on('buildSprites', function() {
		runSequence('sprites');
	});
	keyListener.on('buildCsvIconsFont', function() {
		runSequence('svg-icons-font');
	});
	keyListener.on('downloadGoogleWebFonts', function() {
		runSequence('google-web-fonts');
	});
	keyListener.on('switchDebugMode', function() {
		conf.debug = !conf.debug;
		gutil.log(gutil.colors.blue('Debug mode switched to "'+(conf.debug?'true':'false')+'"'))
	});
	keyListener.on('switchProductionMode', function() {
		conf.production = !conf.production;
		gutil.log(gutil.colors.blue('Production mode switched to "'+(conf.production?'true':'false')+'"'))
		runSequence('html');
	});
	keyListener.on('reloadAll', function() {
		runSequence('remove-watchers', 'less-components', 'js-scripts', 'html', 'add-watchers');
	});
	keyListener.on('build', function() {
		runSequence('build');
	});
	keyListener.start();
});
gulp.task('keys-debug', function() {
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
			else if( key.shift && key.name == 'w' && key.sequence == 'W' ) { 
				gutil.log('Hot key [Shift+w]: Remove watchers');
				_this.emit('removeWatchers');
			}
			else if( false === key.shift && key.name == 'w' && key.sequence == 'w' ) { 
				gutil.log('Hot key [w]: Reload watchers');
				_this.emit('reloadWatchers');
			}
			else if( false === key.shift && key.name == 'h' && key.sequence == 'h' ) {
				gutil.log('Hot key [h]: Build html');
				_this.emit('buildHtml');
			}
			else if( key.shift && key.name == 's' && key.sequence == 'S' ) {
				gutil.log('Hot key [Shift+s]: Build css-bundle');
				_this.emit('buildCssBundle');
			}
			else if( false === key.shift && key.name == 's' ) {
				gutil.log('Hot key [s]: Build styles');
				_this.emit('buildStyles');
			}
			else if( false === key.shift && key.name == 'l' ) {
				gutil.log('Hot key [l]: Build component styles');
				_this.emit('buildComponentStyles');
			}
			else if( false === key.shift && key.name == 'j' ) {
				gutil.log('Hot key [j]: Build js');
				_this.emit('buildJs');
			}
			else if( false === key.shift && key.name == 'k' ) {
				gutil.log('Hot key [k]: Build js (w/o bundles)');
				_this.emit('buildJsScripts');
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
           
        "r" - Более масштабная перегрузка watcher-ов включающая пересборку html, less и js
              Это необходимо например потому, что тот же html зависит от состава файлов css-bundle-а.
              При создании новых компонентов и шаблонов необходимо использовать именно этот вариант.

"Shift + d" - Переключить debug-mode в противоположный.
			  Так же уравляется ключем. $ gulp some-task --debug

"Shift + p" - Переключить production-mode.
              Так же управляется ключем. $ gulp some-task --production
           
        "h" - Сборка njk-файлов в html. Аналог $ gulp html
           
        "s" - Сборка стилей. Аналог $ gulp less

"Shift + s" - Сборка css-bundle-а.
              Аналог $ gulp css-bundle
           
        "l" - Соберет только less-файлы компонентов (component/ns/name/tpl/style.less).
              Аналог недокументированной задачи less-components
           
        "j" - Полная обработка js-файлов в т.ч. создание js-bundle-ов
           
        "k" - Обработка всех скриптов кроме js-bundle-ов.
              Чаще всего используется для файлов script.js в компонентах
              Аналог $ gulp js-scripts
           
        "i" - Минификация картинок в папке img.src/ с перемещением в images/
              Аналог $ gulp images

"Shift + i" - Производит сборку спрайтов.
              Аналог $ gulp sprites

        "f" - Сборка svg-файлов в иконочный шрифт
              Аналог $ gulp svg-icons-font

        "g" - Загрузка шрифтов google-web-fonts (fonts.google.com)
              Аналог $ gulp google-web-fonts
              Загрузка повлечет за собой создание less-файлов, на которые
              настроен watcher, соответственно будут пересобраны все less-файлы $ gulp less

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