
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

    var assertUpdated = function (initialFiles, newMetas, deltas) {
	_.each(deltas, function (delta) {
	    var path = delta[0];
	    var meta = delta[1];
	    if (meta) {
		assert(newMetas.hasOwnProperty(path), 'expected the metadatas returned by updateMetadata to have the requested path.');
		assert.equal(newMetas[path].rev, meta.rev, 'expected the newMetas rev to equal the rev returned in the delta.');
		if (initialFiles.hasOwnProperty(path)) {
		    assert.notEqual(newMetas[path].rev, initialFiles[path].rev, 'did not expect the newMetas rev to equal the original rev.');
		}
	    }
	    else {
		assert(!newMetas.hasOwnProperty(path), 'expected the metadatas returned by updateMetadata to NOT have the requested path after deletion.');
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

    var getMeta = function (path, initialFiles, meta) {
	if (initialFiles && initialFiles.hasOwnProperty(path)) {
	    return initialFiles[path];
	}
	else if (meta) {
	    return meta;
	}
	else {
 	    // don't actually have a meta available
	    return {
		path: path
	    };
	}
    };

    it('should update a specific path when modified (meta arg)', function (done) {
	return afterRandomModify(1, function (cli, initialFiles, delta) {
	    if (delta.length < 1) {
		return done();
	    }
	    var target = getMeta(delta[0][0], initialFiles, delta[0][1]);

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
});