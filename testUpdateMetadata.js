
var metadatamod = require('./metadata');
var tt = require('./testTools');
var mockclient = require('./mockclient').mockclient;
var dt = require('./dbox-tools');
var _ = require('underscore');
var assert = require('assert');
var pathmod = require('path');


var random_string = tt.random_string;

var randomFileTree = tt.randomFileTree;

var randomPick = tt.randomPick;

var pickPathToModify= function (files) {
    if (files.length < 2) {
	throw 'not enough files to pick from.'
    }
    var pick = randomPick(files);
    if (pick.path === '/') {
	return pickPathToModify(files);
    }
    else {
	return pick;
    }
};

var afterRandomModify = function (count, cb) {
    var initialFiles = randomFileTree();

    var cli = mockclient(_.clone(initialFiles));

    return tt.randomModify(cli, initialFiles, count, function (delta) {
	return cb(cli, initialFiles, delta);
    });
};

describe('getDelta', function () {
    
    it('should changes should not include contents attributes', function (done) {

	return afterRandomModify(50, function (cli, initialFiles, delta) {
	    return dt.getDelta(cli, initialFiles, initialFiles, function (err, deltas) {
		assert(!err, 'received error from getDelta');
		assert(deltas.length > 0, 'no deltas.');
		assert(_.some(deltas, function (delta) { 
		    return delta[1] && delta[1].is_dir; 
		}));
		_.each(deltas, function (delta) {
		    var change = delta[1];
		    if (change) {
			assert(!change.hasOwnProperty('contents'), 'a delta metadata has the contents attribute: ' + JSON.stringify(change));
		    }
		});
		return done();
	    });
	});
    });

    it('should get immediate subpath changes when a directory is modified.', function (done) {
	var dirPath = '/dir';
	var file1Path = pathmod.join(dirPath, 'file');
	var cli = mockclient([{path: dirPath, is_dir: true}, {path: file1Path, is_dir:false}]);
	
	var initialMetadata = metadatamod.fileset();
	return dt.delta(cli, null, {
	    reset: function (done) { 
		initialMetadata = metadatamod.fileset();
		return done();
	    }
	    , deltas: function (deltas, done) {
		metadatamod.applyDelta(deltas, initialMetadata);
		return done();
	    }
	    , done: function (err) {
		assert(!err, 'unexpected error from dt.delta');
		var initialDirMeta = initialMetadata[dirPath];
		var file2Path = pathmod.join(dirPath, 'file2');
		return cli.put(file2Path, tt.random_string(), function (err) {
		    assert.equal(err, 200, 'received error putting ' + file2Path);
		    return cli.metadata(dirPath, function (err, changedDirMeta) {
			assert.equal(err, 200, 'unexpected dbox error getting newest dir metadata');
			assert.notEqual(changedDirMeta.hash, initialDirMeta.hash, 'expected putting a file below a directory would change the directory rev');
			return dt.getDelta(cli, initialMetadata, initialDirMeta, function (err, deltas) {
			    assert(!err, 'did not expect error from getDelta');
			    assert(_.some(deltas, function (delta) {
				return delta[1] && delta[1].path === file2Path;
			    }), 'expected to get delta change for added file.');
			    assert(!_.some(deltas, function (delta) {
				return delta[1] && delta[1].path === file1Path;
			    }), 'expected to not get delta change for unchanged file in directory.');
			    return done();
			});
		    });
		});
	    }
	});
    });

});

describe('updateMetadata', function () {


    var getChange = tt.getChange;

    var assertUpdated = function (newMetas, deltas, targets) {
	_.each(dt.toPathArray(targets), function (path) {
	    var meta = getChange(path, deltas);
	    if (meta === false) {
		// no change to target reported in deltas
		return;
	    }
	    if (meta) {
		if (!newMetas.hasOwnProperty(path)) {
		    console.log(deltas);
		}
		assert(newMetas.hasOwnProperty(path), 'expected the metadatas returned by updateMetadata to have the requested path: ' + path);
		assert.equal(newMetas[path].rev, meta.rev, 'expected the newMetas rev to equal the rev returned in the delta.');
	    }
	    else {
		if (newMetas.hasOwnProperty(path)) {
		    console.log('not truthy: ', path, meta, newMetas[path]);
		    console.log(deltas);

		}
		assert(!newMetas.hasOwnProperty(path), 'expected the metadatas returned by updateMetadata to NOT have the requested path after deletion: '+ path);
	    }
	});
    };

    it('should update a specific path when modified (string arg)', function (done) {
	return afterRandomModify(10, function (cli, initialFiles, delta) {
	    if (delta.length < 1) {
		return done();
	    }
	    var oneDelta = randomPick(delta);
	    var path = oneDelta[0];
	    var meta = oneDelta[1];
	    var target = path;

	    return dt.updateMetadata(cli, initialFiles, target, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'expected to receive new fileset from updateMetadata');
		assertUpdated(newMetas, delta, [target]);
		return done();
	    });
	});
    });


    it('should update a specific path when modified (meta arg)', function (done) {
	return afterRandomModify(10, function (cli, initialFiles, delta) {
	    if (delta.length < 1) {
		return done();
	    }
	    var oneDelta = randomPick(delta);
	    var target = {
		path: oneDelta[0]
	    };
	    assert(target, 'falsy target ' + JSON.stringify(target));

	    return dt.updateMetadata(cli, initialFiles, target, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'expected to receive new fileset from updateMetadata');
		assertUpdated(newMetas, delta, [target]);
		return done();
	    });
	});
    });

    it('should change only the specific path or parent dirs if initial metadata provided is empty (string arg)', function (done) {
	return afterRandomModify(10, function (cli, initialFiles, delta) {
	    if (delta.length < 1) {
		return done();
	    }
	    var oneDelta = randomPick(delta);
	    var path = oneDelta[0];
	    var meta = oneDelta[1];
	    var target = path;

	    return dt.updateMetadata(cli, {}, target, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'expected to receive new fileset from updateMetadata');
		assertUpdated(newMetas, delta, [target]);
		_.each(newMetas, function (newMeta) {
		    // all the newMetas should be parent paths, or immediate children of the target
		    var isParentPath = (path.indexOf(newMeta.path) === 0);
		    var isChild = (pathmod.dirname(newMeta.path) === path)
		    assert(isParentPath || isChild, "did not expect to find a meta not a parent or direct child of the target path " + target + ": " + JSON.stringify(newMeta));
		});
		return done();
	    });
	});
    });

    it('should update specific paths when modified (string array arg)', function (done) {
	return afterRandomModify(10, function (cli, initialFiles, deltas) {
	    if (deltas.length < 1) {
		return done();
	    }
	    var targets = _.map(deltas, function (delta) {
		return delta[0];
	    });

	    return dt.updateMetadata(cli, initialFiles, targets, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'expected to receive new fileset from updateMetadata');
		assertUpdated(newMetas, deltas, targets);
		return done();
	    });
	});
    });

    it('should update specific paths when modified (meta array arg)', function (done) {
	return afterRandomModify(10, function (cli, initialFiles, deltas) {
	    if (deltas.length < 1) {
		return done();
	    }
	    var targets = _.map(deltas, function (delta) {
		return {
		    path: delta[0]
		}
	    });

	    return dt.updateMetadata(cli, initialFiles, targets, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'expected to receive new fileset from updateMetadata');
		assertUpdated(newMetas, deltas, targets);
		return done();
	    });
	});
    });

    it('should change only the specific path or parent dirs if initial metadata provided is empty (string array arg)', function (done) {
	return afterRandomModify(10, function (cli, initialFiles, deltas) {
	    if (deltas.length < 1) {
		return done();
	    }
	    var targets = _.map(deltas, function (delta) {
		return delta[0];
	    });

	    return dt.updateMetadata(cli, {}, targets, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'expected to receive new fileset from updateMetadata');
		assertUpdated(newMetas, deltas, targets);

		_.each(newMetas, function (meta) {
		    assert(_.some(targets, function (path) { return path.indexOf(meta.path)==0; })
			   , "found a meta not a parent of any target path " + JSON.stringify(meta));
		});
		return done();
	    });
	});
    });

    it('should update specific paths when modified (meta set arg)', function (done) {
	return afterRandomModify(10, function (cli, initialFiles, deltas) {
	    if (deltas.length < 1) {
		return done();
	    }
	    var targets = {};
	    _.chain(deltas)
		.filter(function () { return Math.random() > 0.5; })
		.each(function (delta) {
		    var path = delta[0];
		    targets[path] = {
			path: path
		    }
		});

	    return dt.updateMetadata(cli, initialFiles, targets, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'expected to receive new fileset from updateMetadata');
		assertUpdated(newMetas, deltas, targets);
		return done();
	    });
	});
    });
});