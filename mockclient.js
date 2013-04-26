
var assert = require('assert');
var _ = require('underscore');
var pathmod = require('path')
var crypto = require('crypto');

var metadata = require('./metadata');

var random_string = function () {
    return crypto.randomBytes(12).toString('hex');
};


var getMeta = function (file, files) {
    var path = file.path;
    var meta = {};
    for (var attr in file) {
	if (file.hasOwnProperty(attr)) {
	    if ((attr !== 'hash') && (attr !== 'data')) {
		meta[attr] = file[attr];
	    }
	}
    }
    if (files) {
	if (file.is_dir) {
	    meta.contents = [];
	    for (var subpath in files) {
		if ((subpath !== path) && (pathmod.dirname(subpath) === path)) {
		    meta.contents.push(getMeta(files[subpath]));
		}
	    }
	    meta.hash = file.hash;
	}
    }
    return meta;
};

var mkdir = function (path) {
    if (path[0] !== '/') {
	throw new Error("path to mkdir did not begin with /")
    }
    return {
	path: path,
	is_dir: true,
	hash: random_string(),
	rev: random_string()
    };
};

var mkfile = function (path, contents) {
    
    if (contents && !(typeof contents === 'string'
		      || contents instanceof Buffer)) {
	contents = JSON.stringify(contents);
    }
    if (contents) {
	contents = new Buffer(contents);
    }
    else {
	contents = new Buffer('');
    }
    
    return {
	path: normalizePath(path),
	is_dir: false,
	data: contents,
	rev: random_string()
    }
};

var normalizePath = exports.normalizePath = metadata.normalizePath;

var check_fileset_invariants = exports.check_fileset_invariants = metadata.fileset_invariants;

var fileset = exports.fileset = function (files) {
    if (!files) {
	return {
	    '/': mkdir('/')
	}
    }
    var set = {};
    if (files) {
	for (var idx in files) {
	    var file = files[idx];
	    if (file.is_dir) {
		set[normalizePath(file.path)] = mkdir(file.path);
	    }
	    else {
		set[normalizePath(file.path)] = mkfile(file.path);
	    }
	}
    }
    if (!set.hasOwnProperty('/')) {
	set['/'] = mkdir('/');
    }
    check_fileset_invariants(set);
    return set;
};

var skewedRandomInt = exports.skewedRandomInt = function (max) {
    return Math.floor(Math.sqrt(max * max * Math.random()));
};

var partition = function (arr, num) {
    var len = arr.length;
    var cuts = _.map(_.range(num - 1), function () {
	return Math.floor(len * Math.random());
    });
    var cutIntervals = _.zip([0].concat(cuts), cuts.concat([len]));

    return _.map(cutIntervals, function (interval) {
	return arr.slice(interval[0], interval[1]);
    });
};

var deltaInstance = function (setThen) {
    var doReset = (skewedRandomInt(2) > 0);
    var numDeltaSets = 1 + skewedRandomInt(3);

    return function (setNow, cursors) {
	var entries;
	if (setThen && !doReset) {
	    entries = _.shuffle(metadata.delta(setNow, setThen));
	}
	else {
	    entries = _.shuffle(_.map(_.toArray(setNow), function (meta) {
		    return [meta.path, meta];
	    }));
	}
	var entrySets = partition(entries, numDeltaSets);
	var nextCursors = _.map(entrySets, function () {
	    return random_string();
	});
	
	var cbs = _.map(nextCursors, function (nextCursor, idx) {

	    var reset = (idx === 0 && doReset);
	    var has_more = (idx < (nextCursors.length - 1))
	    var response = {
		reset: reset
		, has_more: has_more
		, entries: entrySets[idx]
		, cursor: nextCursor
	    }

	    return function (setNow, cursors) {
		return response;
	    };
	});

	// attach the callbacks to the previous nextCursor.  The first
	// cb will be called now, the last nextCursor will call a new
	// delta instance
	_.each(_.zip(nextCursors, _.rest(cbs).concat(deltaInstance(setNow))), function (curscb) {
	    cursors[curscb[0]] = curscb[1];
	});

	return cbs[0]();
    };
};

var nullDeltaInstance = deltaInstance(null);

exports.mockclient = function (files) {
    files = metadata.fileset(files);

    var hasRoot = false;
    var set = {};

    var check_invariants = function () {
	return check_fileset_invariants(set);
    };


    var cursors = {};

    var modifyParentDir = function (path) {
	var dirname = pathmod.dirname(path);
	if (dirname !== path) {
	    try {
		return set[dirname].hash = random_string();
	    }
	    catch (e) {
		console.log(e);
		throw new Error('error changing hash of directory under ' + path + ' (' + dirname + ')', e);
	    }
	}
    };

    var addFile = function (file) {
	if (!file.hasOwnProperty('path')) {
	    throw new Error('no path on file ' + JSON.stringify(file), file);
	}
	file.path = normalizePath(file.path);
	modifyParentDir(file.path);
	return set[file.path] = file;
    };


    for (var idx in files) {
	var f = files[idx];
	var path = normalizePath(f.path);
	if (!path) {
	    throw new Error('An initial file did not have a path property: ' + JSON.stringify(f))
	}
	if (set.hasOwnProperty(path)) {
	    throw new Error('duplicate initial path in files' + path);
	}
	var file;
	if (f.is_dir) {
	    file = mkdir(path);
	}
	else {
	    var data;
	    if (f.hasOwnProperty('data')) {
		data = f.data;
	    }
	    file = mkfile(path, data);
	    for (var attr in f) {
		if (!file.hasOwnProperty(attr)) {
		    file[attr] = f[attr];
		}
	    }
	}
	addFile(file);
    }
    
    check_invariants();

    var rmPath = function (path) {
	modifyParentDir(path);
	if (set[path].is_dir) {
	    return metadata.rmDir(set, path);
	}
	else {
	    return delete set[path];
	}
    };

    var that = {
	metadata: function (path, options, cb) {
	    check_invariants();
	    path = normalizePath(path);
	    if (!cb) {
		cb = options;
		options = {};
	    }
	    if (!set.hasOwnProperty(path)) {
		check_invariants();
		return cb(404);
	    }
	    else {
		var meta = getMeta(set[path], set);
		if (meta.is_dir && options.hasOwnProperty('hash') && meta.hash === options.hash) {
		    check_invariants();
		    return cb(304);
		}
		else {
		    check_invariants();
		    return cb(200, meta);
		}
	    }
	},

	mkdir: function (path, cb) {
	    check_invariants();
	    path = normalizePath(path);
	    if (set.hasOwnProperty(path)) {
		check_invariants();
		return cb(304);
	    }
	    else {
		check_invariants();
		return cb(200, getMeta(set[path] = mkdir(path)));
	    }
	},

	rm: function (path, cb) {
	    check_invariants();
	    path = normalizePath(path);
	    if (path === '/') {
		return cb(5000);
	    }

	    if (set.hasOwnProperty(path)) {
		rmPath(path);
		check_invariants();
		return cb(200);
	    }
	    else {
		check_invariants();
		return cb(404);
	    }
	},

	mv: function (path, newPath, cb) {
	    if (typeof cb !== 'function') {
		cb = function() {};
	    }
	    check_invariants();
	    path = normalizePath(path);
	    newPath = normalizePath(newPath);
	    if (!set.hasOwnProperty(path)) {
		check_invariants();
		return cb(404);
	    }
	    return that.put(newPath, set[path].data, function (err) {
		if (err !== 200) {
		    check_invariants();
		    return cb(err);
		}
		check_invariants();
		return that.rm(path, cb);
	    });
	},

	get: function (path, cb) {
	    check_invariants();
	    path = normalizePath(path);
	    if (!set.hasOwnProperty(path)) {
		check_invariants();
		return cb(404);
	    }
	    check_invariants();
	    return cb(200, new Buffer(set[path].data));
	},

	put: function (path, data, cb) {
	    check_invariants();
	    path = normalizePath(path);
	    if (path === '/') {
		return cb(5000);
	    }
	    
	    var dirName = pathmod.dirname(path);
	    if (!set[dirName].is_dir) {
		return cb(4000);
	    }
	    var file = mkfile(path, data)
	    if (set.hasOwnProperty(path)) {
		rmPath(path);
	    }
	    addFile(file);
	    check_invariants();
	    return cb(200, getMeta(file));
	},

	cp: function (path, otherPath, cb) {
	    check_invariants();
	    otherPath = normalizePath(otherPath);
	    if (otherPath === '/') {
		return cb(5000);
	    }


	    if (path.hasOwnProperty('copy_ref')) {
		// they're trying to copy from a ref.  let's just pretend we did something.
		return that.put(otherPath, JSON.stringify(path), cb);
	    }
	    path = normalizePath(path);
	    if (!set.hasOwnProperty(path)) {
		check_invariants();
		return cb(404);
	    }
	    check_invariants();
	    return that.put(otherPath, set[path].data, cb);
	},

	cpref: function (path, cb) {
	    check_invariants();
	    path = normalizePath(path);
	    if (!set.hasOwnProperty(path)) {
		check_invariants();
		return cb(404);
	    }
	    check_invariants();
	    return cb(200, {
		expires:1,
		copy_ref: 1,
	    });
	},

	files: function () {
	    check_invariants();
	    return _.clone(set);
	},

	delta: function (args, cb) {
	    check_invariants();
	    if (!args.hasOwnProperty('cursor')) {
		return cb(4000); // don't know what is the appropriate error code for this
	    }
	    var cursor = args.cursor;

	    if (!cursor) {
		return cb(200, nullDeltaInstance(_.clone(set), cursors));
	    }
	    else if (cursors.hasOwnProperty(cursor)) {
		return cb(200, cursors[cursor].call(this, _.clone(set), cursors));
	    }
	    else {
		return cb(4001); // again, not sure what error status to return here.
	    }
	}
    };
    return that;
};