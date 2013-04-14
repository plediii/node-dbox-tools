
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

    it('should update a specific path when modified (string arg)', function (done) {
	var initialFiles = randomFileTree();

	var cli = mockclient(_.clone(initialFiles));

	var path = pickPathToModify(_.toArray(initialFiles)).path;

	return cli.put(path, random_string(), function (err, meta) {
	    assert.equal(err, 200, "did not expect an error replacing path " + path + " " + err);
	    assert(meta.rev !== initialFiles[path].rev, "did not expect the replaced path rev to equal the original rev");
	    return dt.updateMetadata(cli, initialFiles, path, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'function expected to receive new fileset from updateMetadata');
		assert(newMetas.hasOwnProperty(path), 'expected the metadatas returned by updateMetadata to have the requested path.');
		assert.notEqual(newMetas[path].rev, initialFiles[path].rev, 'did not expect the newMetas rev to equal the original rev.');
		assert.equal(newMetas[path].rev, meta.rev, 'expected the newMetas rev to equal the rev returned by put.');
		return done();
	    });
	});
    });

    it('should update a specific path when modified (meta arg)', function (done) {
	var initialFiles = randomFileTree();

	var cli = mockclient(_.clone(initialFiles));

	var path = pickPathToModify(_.toArray(initialFiles)).path;

	return cli.put(path, random_string(), function (err, meta) {
	    assert.equal(err, 200, "did not expect an error replacing path " + path + " " + err);
	    assert(meta.rev !== initialFiles[path].rev, "did not expect the replaced path rev to equal the original rev");
	    return dt.updateMetadata(cli, initialFiles, initialFiles[path], function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'function expected to receive new fileset from updateMetadata');
		assert(newMetas.hasOwnProperty(path), 'expected the metadatas returned by updateMetadata to have the requested path.');
		assert.equal(newMetas[path].rev, meta.rev, 'expected the newMetas rev to equal the rev returned by put.');
		assert.notEqual(newMetas[path].rev, initialFiles[path].rev, 'did not expect the newMetas rev to equal the original rev.');
		return done();
	    });
	});
    });

    it('should change only the specific path or parent dirs metadata provided is empty (string arg)', function (done) {
	var initialFiles = randomFileTree();

	var cli = mockclient(_.clone(initialFiles));

	var path = pickPathToModify(_.toArray(initialFiles)).path;

	return cli.put(path, random_string(), function (err, meta) {
	    assert.equal(err, 200, "did not expect an error replacing path " + path + " " + err);
	    assert(meta.rev !== initialFiles[path].rev, "did not expect the replaced path rev to equal the original rev");
	    return dt.updateMetadata(cli, {}, path, function (err, newMetas) {
		assert(!err, 'did not expect error from updateMetadata');
		assert(newMetas, 'function expected to receive new fileset from updateMetadata');
		assert(newMetas.hasOwnProperty(path), 'expected the metadatas returned by updateMetadata to have the requested path.');
		assert.notEqual(newMetas[path].rev, initialFiles[path].rev, 'did not expect the newMetas rev to equal the original rev.');
		assert.equal(newMetas[path].rev, meta.rev, 'expected the newMetas rev to equal the rev returned by put.');
		_.each(newMetas, function (meta) {
		    assert.equal(path.indexOf(meta.path), 0, "did not expect to find a meta not a parent of the target path " + JSON.stringify(meta));
		});
		return done();
	    });
	});
    });

});