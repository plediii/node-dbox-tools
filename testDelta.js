
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
	change: function (path, mod, cb) {
	    deltas.push([path, mod]);
	    return cb();
	},
	done: function (err, newCursor) {
	    assert(!err, 'did not expect an error during mock client tests' + JSON.stringify(err));
	    return cb(reset, deltas, newCursor);
	}
    });
};

var skewedRandomInt = tt.skewedRandomInt;

var randomFile = function (parentPath) {
    return {path: pathmod.join(parentPath, random_string()), data: random_string(), is_dir: false};
};

var randomDirectoryTree = function (path, options) {
    options = _.clone(options);

    var components = [[{path: path, is_dir: true}]];
    var fileCount = skewedRandomInt(options.maxFilesInDir + 1);
    for (var count = 0; count < fileCount; count++)
    {
	components.push([randomFile(path)]);
    }


    if (options.maxLevels > 0) {
	options.maxLevels = skewedRandomInt(options.maxLevels);
	var branchCount = skewedRandomInt(options.maxBranch + 1);
	for (var count = 0; count < branchCount; count++)
	{
	    var dirname = random_string();
	    components.push(randomDirectoryTree(pathmod.join(path, dirname), options));
	}
    }

    return _.flatten(components);
};

var randomFileTree = function (options) {
    options = _.defaults(options || {}, {
	maxFilesInDir: 10
	, maxLevels: 3
	, maxBranch: 4
    });

    return fileset(randomDirectoryTree('/', options));
};

var randomModify = function (client, fileset, count, cb) {
    fileset = _.clone(fileset);
    check_fileset_invariants(fileset);
    var pathsToModify = _.values(fileset);
    var mods = [];

    var pickPathToModify = function (pathsToModify) {
	if (pathsToModify.length === 0) {
	    throw 'pathsToModify length is 0';
	}
	var idx = Math.floor(pathsToModify.length * Math.random());
	return pathsToModify[idx].path;
    };

    var doRandomModification = function (path, cb) {
	return client.metadata(path, function (err, meta) {
	    assert.equal(err, 200, 'did not expect an error getting metadata of path to modify: ' + path + ' ' + JSON.stringify(err));
	    var modType = Math.floor(2 * Math.random());
	    if (modType === 0) {
		// remove
		if (path === '/') {
		    return cb();
		}

		var oldLen = pathsToModify.length;
		pathsToModify = _.filter(pathsToModify, function (oldMeta) {
		    try {
			return oldMeta.path.indexOf(path) !== 0;
		    }
		    catch (e) {
			console.log(pathsToModify);
			console.log('exception filtering ', oldMeta, e);
			throw e;
		    }
		});
		assert(pathsToModify.length < oldLen, 'filtering for "' + path + '" apparently had no effect');
		if (meta.is_dir) {
		    // remove directory
		    if (path === '/') {
			return cb();
		    }
		    var rmType = Math.floor(2 * Math.random());
		    if (rmType === 0) {
			// directly remove
			return client.rm(path, function (err) {
			    assert.equal(err, 200, 'expected success putting')
			    return cb();
			});
		    }
		    else {
			// remove by replacing with a file
			return client.put(path, random_string(), function (err) {
			    assert.equal(err, 200, 'expected success putting');
			    return cb();
			});
		    }
		}
		else {
		    // remove file
		    return client.rm(path, function (err) {
			assert.equal(err, 200, 'did not expect error removing path');
			return cb();
		    });
		}
	    } 
	    else {
		// change
		if (meta.is_dir) {
		    // change dir
		    var changeType = Math.floor(2 * Math.random());
		    // change by adding file
		    var filePath = path + '/' + random_string();
		    return client.put(filePath, random_string(), function (err, meta) {
			assert.equal(err, 200, 'expected success puting file');
			assert(meta, 'expected to receive meta from put');
			pathsToModify.push(meta);
			return cb();
		    });
		}
		else {
		    // change file
		    return client.put(path, random_string(), function (err) {
			assert.equal(err, 200, 'expected success putting file ' + path);
			return cb();
		    });
		}
	    }
	});
    };

    return (function modifyLoop (count) {
	if (count < 1) {
	    return cb();
	}
	return doRandomModification(pickPathToModify(pathsToModify), function () {
	    return modifyLoop(count - 1);
	});
    })(count);
};

var clientFileStructure = function (client, files, cb) {
    var clientHasFilesLoop = function (files, done) {
	if (files.length < 1) {
	    return done();
	}
	return client.metadata(_.head(files).path, function (err, meta) {
	    if (err !== 200) {
		return cb('client does not contain file ' + _.head(files).path);
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
	    assert(meta.hasOwnProperty('contents'), 'not expecting a directory to not have contents');
	    for (var mIdx in meta.contents) {
		var m = meta.contents[mIdx];
		if (!files.hasOwnProperty(m.path)) {
		    return cb('client has file not listed in file structure ' + m.path);
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