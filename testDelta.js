
var mockclientmod = require('./mockclient');
var delta = require('./dbox-tools').delta;
var _ = require('underscore');
var metadata = require('./metadata')

var pathmod = require('path');

var assert = require('assert');
var tt = require('./testTools');

var random_string = tt.random_string;

var mockclient = mockclientmod.mockclient;
var check_fileset_invariants = mockclientmod.check_fileset_invariants;
var normalizePath = mockclientmod.normalizePath;
var fileset = metadata.fileset;

var deltaList = function (client, cursor, cb) {
    assert.equal(typeof(cb), 'function');
    var deltas = [];
    var reset = false;

    return delta(client, cursor, {
	reset: function (cb) {
	    deltas = [];
	    reset = true;
	    return cb();
	},
	deltas: function (additionalDeltas, cb) {
	    deltas = deltas.concat(additionalDeltas);
	    return cb();
	},
	done: function (err, newCursor) {
	    assert(!err, 'did not expect an error during mock client tests' + JSON.stringify(err));
	    return cb(reset, deltas, newCursor);
	}
    });
};

var skewedRandomInt = tt.skewedRandomInt;

var randomModify = tt.randomModify;

var randomFile = tt.randomFile;
var randomDirectoryTree = tt.randomDirectoryTree;
var randomFileTree = tt.randomFileTree;

var clientFileStructure = function (client, files, cb) {
    var clientHasFilesLoop = function (files, done) {
	if (files.length < 1) {
	    return done();
	}
	var headFile = _.head(files)
	return client.metadata(headFile.path, function (err, meta) {
	    if (err !== 200) {
		return cb('client does not contain file ' + _.head(files).path);
	    }
	    if (meta.is_dir !== headFile.is_dir) {
		return cb('client is_dir flag does match fileset ' + headFile.path);
	    }
	    return clientHasFilesLoop(_.rest(files), done);
	});
    };

    var filesMatchClientDir = function (path, done) {
	if (!files.hasOwnProperty(path)) {
	    return cb('files does not have ' + path);
	}
	if (!files[path].is_dir) {
	    return cb('files does not list path as directory: ' + path);
	}
	return client.metadata(path, function (err, meta) {
	    assert.equal(err, 200, 'not expecting error while walking client');
	    assert(meta.is_dir, 'expecting filesMatchClientDir to be called only on directories');
	    assert(meta.hasOwnProperty('contents'), 'directory metadata returned by client does not have contents');
	    for (var mIdx in meta.contents) {
		var m = meta.contents[mIdx];
		if (!files.hasOwnProperty(m.path)) {
		    return cb('client has file not listed in file structure ' + m.path);
		}
		if (m.is_dir !== files[m.path].is_dir) {
		    return cb('client directory flag for ' + path + ' does not match file set.')
		}
	    }
	    return (function checkSubDirs (contents) {
		if (contents.length < 1) {
		    return done();
		}
		var m = _.head(contents);
		var rest = _.rest(contents);
		if (m.is_dir) {
		    return filesMatchClientDir(m.path, function () {
			checkSubDirs(rest);
		    });
		}
		else {
		    return checkSubDirs(rest);
		}
	    })(meta.contents);
	});
    };

    return clientHasFilesLoop(_.toArray(files), function () {
	return filesMatchClientDir('/', cb);
    });
};

var assertClientFileStructure = function (client, files, message, cb) {
    return clientFileStructure(client, files, function (diff) {
	assert(!diff, message + ': ' + diff);
	return cb();
    });
};

var assertNotClientFileStructure = function (client, files, message, cb) {
    return clientFileStructure(client, files, function (diff) {
	assert(diff, message);
	return cb();
    });
};


describe('client delta', function () {

    it('should give complete file set on null cursor', function (done) {
	var initialFiles = check_fileset_invariants(randomFileTree());
	check_fileset_invariants(initialFiles);
	var client = mockclient(initialFiles);
	return assertClientFileStructure(client, initialFiles, 'expected client file structure to be the initial files', function () {
	    return deltaList(client, null, function (reset, l) {
		for (var deltaItemIdx in l) {
		    var deltaItem = l[deltaItemIdx];
		    var path = deltaItem[0];
		    var change = deltaItem[1];
		    assert(change, 'did not expect deletions on null cursor delta');
		    assert(initialFiles.hasOwnProperty(normalizePath(path)), 'delta list contained a file not in initial files' + JSON.stringify(path));
		}
		var changedPaths = _.map(l, function (f) {
		    return f[0];
		});
		for (var fIdx in initialFiles) {
		    var f = initialFiles[fIdx];
		    if (f.path !== '/') {
			assert(_.contains(changedPaths, f.path), 'a file in the initial file set did not appear in the null cursor delta list ' + f.path);
		    }
		}
		return done();
	    });
	});
    });
      

    it('should give expected modifications on given cursor', function (done) {
	var count = 5;
	return (function testLoop () {
	    return process.nextTick(function () {
		count = count - 1;
		if (count < 1) {
		    return done();
		}
		var tree = randomFileTree();
		var initialFiles = check_fileset_invariants(tree);
		var client = mockclient(initialFiles);
		return assertClientFileStructure(client, _.clone(initialFiles), 'expected client file structure to be the initial files', function () {
		    return deltaList(client, null, function (reset, l, newCursor) {
			assert(newCursor, 'expected to get a new cursor from null delta');
			return randomModify(client, _.clone(initialFiles), 10, function (randomMods) {
			    return deltaList(client, newCursor, function (reset, deltaMods) {
				return assertNotClientFileStructure(client, _.clone(initialFiles), 'expected client file structure to be changed by randomModify', function () {
				    var newFiles;
				    if (reset) {
					newFiles = metadata.applyDelta(deltaMods, metadata.fileset());
				    }
				    else {
					newFiles = metadata.applyDelta(deltaMods, _.clone(initialFiles));
				    }
				    return assertClientFileStructure(client, newFiles, 'expected client file structure to be the changed file set ', testLoop);
				});
			    });
			});
		    });
		});
	    })
	})(10);
    });
});