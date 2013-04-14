var mockclientmod = require('./mockclient');
var mockclient = mockclientmod.mockclient;
var assert = require('assert');
var crypto = require('crypto');
var _ = require('underscore');
var pathmod = require('path');
var metadatamod = require('./metadata');

var normalizePath = mockclientmod.normalizePath;

var random_string = exports.random_string = function () {
    return crypto.randomBytes(12).toString('hex');
};

var check_fileset_invariants = metadatamod.fileset_invariants;

exports.clientFactory = function (initialFiles) {
    initialFiles = _.clone(initialFiles);
    return function (theseFiles) {
	if (!theseFiles) {
	    theseFiles = [];
	}

	return mockclient(_.flatten([ _.clone(_.filter(initialFiles, function (file) {
	    return !_.find(theseFiles, function (otherFile) {
		return normalizePath(file.path) === normalizePath(otherFile.path);
	    });
	}))
				      , _.clone(theseFiles)
				    ]));
    };
};

var skewedRandomInt = exports.skewedRandomInt = mockclientmod.skewedRandomInt;


var randomFile = exports.randomFile = function (parentPath) {
    return {path: pathmod.join(parentPath, random_string()), data: random_string(), is_dir: false};
};

var randomDirectoryTree = exports.randomDirectoryTree = function (path, options) {
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

var randomFileTree = exports.randomFileTree = function (options) {
    options = _.defaults(options || {}, {
	maxFilesInDir: 10
	, maxLevels: 3
	, maxBranch: 4
    });

    return metadatamod.fileset(randomDirectoryTree('/', options));
};

var randomPick = exports.randomPick = function (arr) {
    if (arr.length < 1) {
	throw 'unable to pick from an empty array.'
    }
    var idx = Math.floor(arr.length * Math.random());
    return arr[idx];
};


var randomModify = exports.randomModify = function (client, fileset, count, cb) {
    fileset = _.clone(fileset);
    check_fileset_invariants(fileset);
    var pathsToModify = _.values(fileset);
    var mods = [];

    var pickPathToModify = function (pathsToModify) {
	if (pathsToModify.length === 0) {
	    throw 'pathsToModify length is 0';
	}
	return randomPick(pathsToModify).path;
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