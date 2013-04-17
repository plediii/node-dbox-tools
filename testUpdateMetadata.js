
var metadatamod = require('./metadata');
var tt = require('./testTools');
var mockclient = require('./mockclient').mockclient;
var dt = require('./dbox-tools');
var _ = require('underscore');
var assert = require('assert');


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

describe('updateMetadata', function () {

    var afterRandomModify = function (count, cb) {
	var initialFiles = randomFileTree();

	var cli = mockclient(_.clone(initialFiles));

	return tt.randomModify(cli, initialFiles, count, function (delta) {
	    return cb(cli, initialFiles, delta);
	});
    };

    var getChange = function (path, deltas) {
	var deltaPaths = _.map(deltas, function (delta) { return delta[0]; } );
	var idx = _.lastIndexOf(deltaPaths, path);
	if (idx < 0) {
	    return false;
	}
	var change = deltas[idx][1];
	// we consider this to be the actual change if no parent path
	// was deleted afterwards
	if (change 
	    && _.chain(deltaPaths.slice(idx))
	    .filter(function (parentPath) { return parentPath !== path &&  path.indexOf(parentPath)===0; })
	    .all(function (parentPath) { 
		var parentChange = getChange(parentPath, deltas.slice(idx));
		return parentChange !== null && parentChange.is_dir;
	    })
	    .value())
	{
	    return change;
	}
	else {
	    return null;
	}
    };

    var assertUpdated = function (initialFiles, newMetas, deltas) {
	_.each(deltas, function (theDelta) {
	    var path = theDelta[0];
	    assert(path, 'got falsy path ' + JSON.stringify(path));
	    var meta = getChange(path, deltas);
	    assert(meta !== false, 'no change for path ' + path + ' in ' + JSON.stringify(deltas));
	    if (meta) {
		if (!newMetas.hasOwnProperty(path)) {
		    console.log(deltas);
		}
		assert(newMetas.hasOwnProperty(path), 'expected the metadatas returned by updateMetadata to have the requested path: ' + path);
		assert.equal(newMetas[path].rev, meta.rev, 'expected the newMetas rev to equal the rev returned in the delta.');
		if (initialFiles.hasOwnProperty(path)) {
		    assert.notEqual(newMetas[path].rev, initialFiles[path].rev, 'did not expect the newMetas rev to equal the original rev.');
		}
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
	return afterRandomModify(1, function (cli, initialFiles, delta) {
	    if (delta.length < 1) {
		return done();
	    }
	    var path = delta[0][0];
	    var meta = delta[0][1];
	    var target = path;

	    return dt.updateMetadata(cli, initialFiles, target, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'function expected to receive new fileset from updateMetadata');
		assertUpdated(initialFiles, newMetas, delta);
		return done();
	    });
	});
    });


    it('should update a specific path when modified (meta arg)', function (done) {
	return afterRandomModify(1, function (cli, initialFiles, delta) {
	    if (delta.length < 1) {
		return done();
	    }
	    var target = {
		path: delta[0][0]
	    };
	    assert(target, 'falsy target ' + JSON.stringify(target));

	    return dt.updateMetadata(cli, initialFiles, target, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'function expected to receive new fileset from updateMetadata');
		assertUpdated(initialFiles, newMetas, delta);
		return done();
	    });
	});
    });

    it('should change only the specific path or parent dirs if initial metadata provided is empty (string arg)', function (done) {
	return afterRandomModify(1, function (cli, initialFiles, delta) {
	    if (delta.length < 1) {
		return done();
	    }
	    var path = delta[0][0];
	    var meta = delta[0][1];
	    var target = path;

	    return dt.updateMetadata(cli, {}, target, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'function expected to receive new fileset from updateMetadata');
		assertUpdated({}, newMetas, delta);
		_.each(newMetas, function (meta) {
		    assert.equal(path.indexOf(meta.path), 0, "did not expect to find a meta not a parent of the target path " + JSON.stringify(meta));
		});
		return done();
	    });
	});
    });

    it('should update a specific paths when modified (string array arg)', function (done) {
	return afterRandomModify(10, function (cli, initialFiles, deltas) {
	    if (deltas.length < 1) {
		return done();
	    }
	    var targets = _.map(deltas, function (delta) {
		return delta[0];
	    });

	    return dt.updateMetadata(cli, initialFiles, targets, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'function expected to receive new fileset from updateMetadata');
		assertUpdated(initialFiles, newMetas, deltas);
		return done();
	    });
	});
    });

    it('should update a specific paths when modified (meta array arg)', function (done) {
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
		assert(newMetas, 'function expected to receive new fileset from updateMetadata');
		assertUpdated(initialFiles, newMetas, deltas);
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
		assert(newMetas, 'function expected to receive new fileset from updateMetadata');
		assertUpdated({}, newMetas, deltas);

		_.each(newMetas, function (meta) {
		    assert(_.some(targets, function (path) { return path.indexOf(meta.path)==0; })
			   , "found a meta not a parent of any target path " + JSON.stringify(meta));
		});
		return done();
	    });
	});
    });
});