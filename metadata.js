
var assert = require('assert');
var _ = require('underscore');
var pathmod = require('path');
var crypto = require('crypto');

var normalizePath = exports.normalizePath = function (path) {
    if (!path) {
	throw new Error('unable to normalize "' + path + '"');
    }
    if (path[0] !== '/') {
	return '/' + path;
    }
    else {
	return path;
    }
};

var random_string = function () {
    return crypto.randomBytes(12).toString('hex');
};

var fileset = exports.fileset = function (files) {
    var set = {};
    for (var idx in files) {
	if (files.hasOwnProperty(idx)) {
	    var file = _.defaults(_.clone(files[idx]), {
		rev: random_string()
		, is_dir: false
	    });
	    if (!file.path) {
		throw new Error('this was expected to be a file with a path: ' + JSON.stringify(file));
	    }
	    file.path = normalizePath(file.path);
	    set[file.path] = file;
	}
    }
    if (!set.hasOwnProperty('/')) {
	set['/'] = {
	    path: '/'
	    , rev: random_string()
	    , is_dir: true
	}
    }
    fileset_invariants(set);
    return set;
};


var fileset_invariants = exports.fileset_invariants = function (set) {
    assert(set.hasOwnProperty('/'), 'root directory is not present');
    for (var path in set) {
	var file = set[path];
	assert(file.hasOwnProperty('path'), 'metadata at ' + path + ' does not have a path attribute');
	assert(file.hasOwnProperty('rev'), 'metadata at ' + path + ' does not have a rev attribute');
	assert(file.hasOwnProperty('is_dir'), 'metadata at ' + path + ' does not have a is_dir attribute');
	if (file.is_dir) {
	    assert(!file.hasOwnProperty('contents'), 'directory contents should not be included in the directory metadata.');
	}
	assert.equal(file.path, path, 'metadata.path is not equal to fileset key');
	var dirpath = pathmod.dirname(path);
	assert(set.hasOwnProperty(dirpath), 'the parent directory of ' + path + ' does not exist');
	var dir = set[dirpath];
	assert(dir.is_dir, 'the parent directory of ' + path + ' is not marked as a directory');
    }
    return set;
};

exports.delta = function (setNow, setThen) {
    var deltas = [];
    for (var path in setThen) {
	if (setThen.hasOwnProperty(path) && !setNow.hasOwnProperty(path)) {
	    deltas.push([path, null]);
	}
    }

    for (var path in setNow) {
	if ((setNow.hasOwnProperty(path) && !setThen.hasOwnProperty(path)) 
	    || (setNow[path].rev !== setThen[path].rev)) {
	    deltas.push([path, _.clone(setNow[path])]);
	}
    }

    return deltas;
};

var rmDir = exports.rmDir = function (set, path) {
    fileset_invariants(set);
    if (path === '/') {
	throw 'tried to remove root directory';
    }
    for (var oldPath in set) {
	if (set.hasOwnProperty(oldPath)) {
	    if (set[oldPath].path.indexOf(path) === 0) {
		delete set[oldPath];
	    }
	}
    }
    fileset_invariants(set);
};

var rm = exports.rm = function (set, path) {
    fileset_invariants(set);
    if (!set.hasOwnProperty(path)) {
	return;
    }
    var meta = set[path];
    if (meta.is_dir) {
	return rmDir(set, path);
    }
    else {
	delete set[path];
    }
    fileset_invariants(set);
};

var changePath = exports.changePath = function (set, path, meta) {
    fileset_invariants(set);
    path = normalizePath(path);
    var oldMeta = null;
    if (set.hasOwnProperty(path)) {
	oldMeta = set[path];
    }

    if (meta) {
	// update or add a new 
	if (oldMeta && oldMeta.is_dir && !meta.is_dir) {
	    // if the old meta is a dir, and we are replacing it with a file, remove subpaths
	    rmDir(set, path);
	}
	fileset_invariants(set);
	set[path] = meta;
	var parentPath = pathmod.dirname(path);
	while (!set.hasOwnProperty(parentPath)) {
	    set[parentPath] = {
		path: parentPath
		, is_dir: true
		, rev: random_string()
	    }
	    parentPath = pathmod.dirname(parentPath);
	}
	if (!set[parentPath].is_dir) {
	    throw 'changed meta of path ' + path + '; but ' + parentPath + ' is not a directory';
	}
    }
    fileset_invariants(set);
    return set;
};

var applyDelta = exports.applyDelta = function (deltaList, set) {
    fileset_invariants(set);
    for (var idx in deltaList) {
	var delta = deltaList[idx];
	var path = delta[0];
	var newMeta = delta[1];

	if (newMeta) {
	    changePath(set, path, newMeta);
	}
	else {
	    rm(set, path);
	}
	fileset_invariants(set);
    }
    return set;
};

