
var mockclient = require('./mockclient').mockclient;
var assert = require('assert');
var crypto = require('crypto');
var _ = require('underscore');
var tt = require('./testTools');
var metadata = require('./metadata');

var random_string = tt.random_string;

var clientFactory = tt.clientFactory;

var normalizePath = metadata.normalizePath;

var minimalFileSet = function () {

    return [{
	"path": "/",
	"is_dir": true,
    }, {
	"path": "/file",
	"is_dir": false,
    }]
};


var freshClient = clientFactory(minimalFileSet());

describe('mock client construction', function () {

    it('should succeed with minimal file set', function (done) {
	assert(mockclient(minimalFileSet()));
	done();
    });

    it('should succeed with just root path', function (done) {
	assert(mockclient([{
	    "path": "/",
	    "is_dir": true,
	}]));
	done();
    });

    it('should expect root path to be a dir', function (done) {
	assert.throws(function () {
	    return mockclient([{
	    "path": "/",
	    "is_dir": false,
	    }])
	}, 
		      Error);
	done();
    });

    it('should succeed with root path and a file', function (done) {
	assert(mockclient([{
	    "path": "/",
	    "is_dir": true,
	}, {
	    "path": "/file",
	    "is_dir": false,
	}]));
	done();
    });
});

var mockClientShouldHaveFunction = function (name) {
    var client = mockclient(minimalFileSet());
    assert(client.hasOwnProperty(name), 'mock client does not have the function ' + name);
    assert.equal((typeof client[name]), 'function', 'mock client ' + name + ' is not a function');
    return client;
};

// describe('mock client metadata', function () {

//     before(function (done) {
// 	mockClientShouldHaveFunction('metadata');
// 	done();	
//     });

//     var client = mockclient(minimalFileSet());

//     it('should return status 200 for root path', function (done) {
// 	return client.metadata('/', function (err, meta) {
// 	    assert(err);
// 	    assert.equal(err, 200);
// 	    done();
// 	});
//     });

//     it('should return status 200 for root path', function (done) {
// 	return client.metadata('/', function (err, meta) {
// 	    assert(err);
// 	    assert.equal(err, 200);
// 	    done();
// 	});
//     });
// });

describe("metadata rev", function () {

    it ("should initially exist", function (done) {
	client = freshClient();
	return client.metadata('/file', function (err, meta) {
	    assert.equal(err, 200, 'expected /file to initially exist');
	    assert(meta.rev, 'expected file to initially have revision');
	    return done();
	});
    });

    var testRevChange = function (name, test) {
	client = freshClient();
	it("should incrase after " + name, function (done) {
	    var client = freshClient();
	    var fileName = '/file';

	    return client.metadata(fileName, function (err, meta) {
		assert.equal(err, 200, 'expected success on initial metadata');
		var initialRevision = meta.rev;

		return test(client, fileName, function () {
		    return client.metadata(fileName, function (err, meta) {
			assert.equal(err, 200, 'expected metadata to exist after test.');
			assert(meta.rev, 'expected changed file to have rev');
			assert.notEqual(initialRevision, meta.rev, 'expected rev to change on changed file');
			done();
		    });
		});
	    });
	});
    };

    testRevChange('put', function (client, fileName, done) {
	return client.put(fileName, random_string(), function (err) {
	    assert.equal(err, 200, 'expected success putting ' + fileName) ;
	    done();
	});
    });

    testRevChange('cp', function (client, fileName, done) {
	var tempFileName = random_string();
	return client.put(tempFileName, random_string(), function (err) {
	    assert.equal(err, 200, 'expected success putting temporary file ' + tempFileName);
	    return client.cp(tempFileName, fileName, function (err) {
		assert.equal(err, 200, 'expected success cp-ing ' + tempFileName + ' over ' + fileName);
		done();
	    });
	});
    });

    testRevChange('mv', function (client, fileName, done) {
	var tempFileName = random_string();
	return client.put(tempFileName, random_string(), function (err) {
	    assert.equal(err, 200, 'expected success putting temporary file ' + tempFileName);
	    return client.mv(tempFileName, fileName, function (err) {
		assert.equal(err, 200, 'expected success mv-ing ' + tempFileName + ' over ' + fileName);
		done();
	    });
	});
    });

});

describe("mock client root metadata request", function () {

    var rootMeta = function (cb) {
	var client = mockclient(minimalFileSet());
	return client.metadata('/', cb);
    };


    before(function (done) {
	mockClientShouldHaveFunction('metadata');
	return rootMeta(function () {
	    done();
	});
    });
    

    it("should return status 200", function (done) {
	rootMeta(function (err, meta) {
	    assert(err);
	    assert.equal(err, 200);
	    done();
	});
    });

    it("should return a meta.", function (done) {
	return rootMeta(function (err, meta) {
	    assert(meta);
	    done();
	});
    });

    it("should return a meta with contents.", function (done) {
	return rootMeta(function (err, meta) {
	    assert(meta.contents);
	    assert(meta.contents.length > 0);
	    done();
	});
    });

    it("should return a meta with a hash.", function (done) {
	return rootMeta(function (err, meta) {
	    assert(meta.hash, 'root dir should have a hash');
	    done();
	});
    });
});

var mockFunctionTests = function (name, initialFiles, tests) {
    var freshClient = clientFactory(initialFiles);

    describe('mock client ' + name, function () {
	before(function (done) {
	    mockClientShouldHaveFunction(name);
	    done();
	});

	it('should test something', function (done) {
	    done();
	});

	return tests(freshClient);
    });

};

var shouldContainFile = function (client, file, message, cb) {
    if (!cb) {
	cb = message;
	message = cb;
    }
    if (typeof file === 'string') {
	return client.metadata(file, function (err, meta) {
	    assert.equal(err, 200, message);
	    assert(meta, message);
	    return cb();
	})
    }
    else {
	if (!file.hasOwnProperty('path')) {
	    throw new Error('file did not contain path ' + JSON.stringify(file), file);
	}
	var path = file.path;
	return client.metadata(path, function (err, meta) {
	    assert.equal(200, err, message);
	    for (var attr in file) {
		if ((attr !== 'data') && (attr !== 'path')) {
		    assert(meta.hasOwnProperty(attr), message);
		    assert.equal(meta[attr], file[attr], message);
		}
	    }
	    if (!file.hasOwnProperty('data')) {
		return cb();
	    }
	    else {
		return client.get(path, function (err, data) {
		    assert.equal(file.data, data, message);
		    return cb();
		});
	    }
	});
    }
};

var shouldContainFiles = function (client, files, message, cb) {
    if (!cb) {
	cb = message;
	message = cb;
    }
    if (typeof cb !== 'function') {
	throw new Error('no callback provided to shouldContainFiles')
    }
    
    if (typeof files === 'string') {
	return shouldContainFile(client, files, message, cb);
    }
    else if (files instanceof Array) {
	return (function files_loop (files) {
	    if (files.length === 0) {
		return cb();
	    } 
	    else {
		var file = files[0];
		return shouldContainFile(client, file, message, function () {
		    return files_loop(files.slice(1));
		});
	    }
	})(files);
    }
    else {
	return shouldContainFile(client, files, message, cb);
    }
};


var shouldNotContainFile = function (client, file, message, cb) {
    if (!cb) {
	cb = message;
	message = cb;
    }
    var assertNotContainPath = function (path) {
	return client.metadata(file, function (err, meta) {
	    assert.notEqual(err, 200, message);
	    assert(!meta, message);
	    return cb();
	});
    }
    if (typeof file === 'string') {
	return assertNotContainPath(file);
    }
    else {
	if (!file.hasOwnProperty('path')) {
	    throw new Error('file did not contain path ' + JSON.stringify(file), file);
	}
	var path = file.path;
	return assertNotContainPath(path);
    }
    return cb();
};

var shouldNotContainFiles = function (client, files, message, cb) {
    if (!cb) {
	cb = message;
	message = cb;
    }
    if (typeof cb !== 'function') {
	throw new Error('no callback provided to shouldNotContainFiles')
    }
    
    if (typeof files === 'string') {
	return shouldNotContainFile(client, files, message, cb);
    }
    else if (files instanceof Array) {
	return (function files_loop (files) {
	    if (files.length === 0) {
		return cb();
	    } 
	    else {
		var file = files[0];
		return shouldNotContainFile(client, file, message, function () {
		    return files_loop(files.slice(1));
		});
	    }
	})();
    }
    else {
	return shouldNotContainFile(client, files, message, cb);
    }
};

mockFunctionTests('metadata', minimalFileSet(), function (freshClient) {
    it('should successfully get metadata of existing file', function (done) {
	var client = freshClient();
	return shouldContainFiles(client, '/file', 'did not find expected file in fresh client', function () {
	    return client.metadata('/file', function (err, meta) {
		assert.equal(err, 200);
		assert(meta);
		assert(meta.hasOwnProperty('path'));
		assert.equal(meta.path, '/file');
		done();
	    });
	});
    });

    it('should successfully get metadata of existing file (no slash)', function (done) {
	var client = freshClient();
	return shouldContainFiles(client, 'file', 'did not find expected file in fresh client', function () {
	    return client.metadata('file', function (err, meta) {
		assert.equal(err, 200);
		assert(meta);
		assert(meta.hasOwnProperty('path'));
		assert.equal(meta.path, '/file');
		done();
	    });
	});
    });

    it('should return 404 for non-existant file', function (done) {
	var fileName =  '/' + random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, fileName, 'unexpectedly found file in fresh client', function () {
	    return client.metadata(fileName, function (err, meta) {
		assert.equal(err, 404);
		assert(!meta);
		done();
	    });
	});
    });

    it('should return 404 for non-existant file (no slash)', function (done) {
	var fileName =  random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, fileName, 'unexpectedly found file in fresh client', function () {
	    return client.metadata(fileName, function (err, meta) {
		assert.equal(err, 404);
		assert(!meta);
		done();
	    });
	});
    });

    it('should successfully get metadata of randomly named existing file', function (done) {
	var fileName = '/' + random_string();
	var content = random_string();
	var client = freshClient([{path: fileName, is_dir: false, data: content}]);
	return shouldContainFiles(client, { path: fileName, is_dir: false, data: content}, 'did not find expected file in fresh client',  function () {
	    return client.metadata(fileName, function (err, meta) {
		assert.equal(err, 200, 'expected success error status');
		assert(meta, 'exepcted to get a meta');
		assert(meta.hasOwnProperty('path'), 'all metas should have a path');
		assert.equal(meta.path, fileName, 'expected to get a meta with the requested path');
		assert(!meta.hasOwnProperty('data'), 'metas should not have the private data attribute.');
		done();
	    });
	});
    });

    it('should successfully get metadata of randomly named existing file (no slash)', function (done) {
	var fileName = random_string();
	var content = random_string();
	var client = freshClient([{path: fileName, is_dir: false, data: content}]);
	return shouldContainFiles(client, { path: fileName, is_dir: false, data: content}, 'did not find expected file in fresh client',  function () {
	    return client.metadata(fileName, function (err, meta) {
		assert.equal(err, 200, 'expected success error status');
		assert(meta, 'exepcted to get a meta');
		assert(meta.hasOwnProperty('path'), 'all metas should have a path');
		assert.equal(meta.path, normalizePath(fileName), 'expected to get a meta with the requested path');
		assert(!meta.hasOwnProperty('data'), 'metas should not have the private data attribute.');
		done();
	    });
	});
    });
});

mockFunctionTests('mkdir', minimalFileSet(), function (freshClient) {
    it('should successfully mkdir', function (done) {
	var client = freshClient();
	var dirname = '/' + random_string();
	return shouldNotContainFiles(client, dirname, 'initial files had the random name', function () {
	    return client.mkdir(dirname, function (err, meta) {
		assert.equal(err, 200, 'expected success status from mkdir');
		assert(meta, 'expected metadata returned from mkdir');
		assert(meta.path, 'expected metadata to have a path')
		assert.equal(meta.path, dirname, 'expected metadata path to equal the name provided.')
		// assert(meta.hash, 'expected the dir metadata to have a hash.'); // not sure if this is supposed to be true
		return shouldContainFiles(client, dirname, 'files did not have the directory after mkdir', done);
	    });
	});
    });

    it('should successfully mkdir (no slash)', function (done) {
	var client = freshClient();
	var dirname = random_string();
	return shouldNotContainFiles(client, dirname, 'initial files had the random name', function () {
	    return client.mkdir(dirname, function (err, meta) {
		assert.equal(err, 200, 'expected success status from mkdir');
		assert(meta, 'expected metadata returned from mkdir');
		assert(meta.path, 'expected metadata to have a path')
		assert.equal(meta.path, normalizePath(dirname), 'expected metadata path to equal the name provided.')
		// assert(meta.hash, 'expected the dir metadata to have a hash.'); // not sure if this is supposed to be true
		return shouldContainFiles(client, dirname, 'files did not have the directory after mkdir', done);
	    });
	});
    });

    it('should return 304 status for already existing directory', function (done) {
	var client = freshClient();
	var dirname = '/' + random_string();
	return shouldNotContainFiles(client, dirname, 'initial files had the random name' + dirname, function () {
	    return client.mkdir(dirname, function (err, meta) {
		assert.equal(err, 200, 'expected success status from mkdir');
		client.mkdir(dirname, function (err, meta) {
		    assert.equal(err, 304, 'expected 304 status from duplicate mkdir');
		    done();
		});
	    });
	});
    });

    it('should return 304 status for already existing directory (no slash)', function (done) {
	var client = freshClient();
	var dirname = random_string();
	return shouldNotContainFiles(client, dirname, 'initial files had the random name' + dirname, function () {
	    return client.mkdir(dirname, function (err, meta) {
		assert.equal(err, 200, 'expected success status from mkdir');
		client.mkdir(dirname, function (err, meta) {
		    assert.equal(err, 304, 'expected 304 status from duplicate mkdir');
		    done();
		});
	    });
	});
    });
});

mockFunctionTests('rm', minimalFileSet(), function (freshClient) {
    it('should remove file', function (done) {
	var client = freshClient();
	var fileName = '/file';
	shouldContainFiles(client, fileName, 'fresh client was expected to be set up containing "file"', function () {
	    return client.rm(fileName, function (err) {
		assert.equal(err, 200);
		return shouldNotContainFiles(client, fileName, 'expected to not find fileName in private files after rm', done);
	    });
	});
    });

    it('should remove file (no slash)', function (done) {
	var client = freshClient();
	var fileName = 'file';
	shouldContainFiles(client, fileName, 'fresh client was expected to be set up containing "file"', function () {
	    return client.rm(fileName, function (err) {
		assert.equal(err, 200);
		return shouldNotContainFiles(client, fileName, 'expected to not find fileName in private files after rm', done);
	    });
	});
    });

    it('should return 404 when attempting to  move a non-existant', function (done) {
	var firstFileName = '/' + random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, firstFileName, 'did not find expected file in client private files', function () {
	    return client.rm(firstFileName, function (err) {
		assert.equal(err, 404, 'expected 404 status when trying to move a non-existant file');
		done();
	    });	 	   
	}); 
    });

    it('should return 404 when attempting to  move a non-existant (no slash)', function (done) {
	var firstFileName = random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, firstFileName, 'did not find expected file in client private files', function () {
	    return client.rm(firstFileName, function (err) {
		assert.equal(err, 404, 'expected 404 status when trying to move a non-existant file');
		done();
	    });	 	   
	}); 
    });
});

mockFunctionTests('put', minimalFileSet(), function (freshClient) {
    it('should add a file to the list with the given contents', function (done) {
	var client = freshClient();
	var fileName = '/' + random_string();
	var contents = random_string();
	return shouldNotContainFiles(client, fileName, 'unexpectedly found file in fresh client', function () {
	    return client.put(fileName, contents, function (err, meta) {
		assert.equal(err, 200);
		assert(meta, 'put did not return the new metadata.');
		assert(!meta.hasOwnProperty('data'), 'meta had private data information');
		return shouldContainFiles(client, {
		    path: fileName,
		    data: contents
		}, 'expected to find file in private files after put', 
					  done);
	    });
	});
    });

    it('should add a file to the list with the given contents (no slash)', function (done) {
	var client = freshClient();
	var fileName = random_string();
	var contents = random_string();
	return shouldNotContainFiles(client, fileName, 'unexpectedly found file in fresh client', function () {
	    return client.put(fileName, contents, function (err, meta) {
		assert.equal(err, 200);
		assert(meta, 'put did not return the new metadata.');
		assert(!meta.hasOwnProperty('data'), 'meta had private data information');
		return shouldContainFiles(client, {
		    path: fileName,
		    data: contents
		}, 'expected to find file in private files after put', 
					  done);
	    });
	});
    });

    it('should remove files when put over a path', function (done) {
	var dirName = '/dir';
	var fileName = '/dir/subfile';
	var initialFiles = [{path: dirName, is_dir: true}, {path: fileName, is_dir: false}];
	var client = freshClient(initialFiles);
	return shouldContainFiles(client, initialFiles, 'did not find initial files in fresh client', function () {
	    return client.put(dirName, random_string(), function (err, meta) {
		assert.equal(err, 200);
		return shouldNotContainFiles(client, fileName, 
					     'expected not to find subfile in private files after put on dir name', 
					     done);
	    });
	});
    });

    it('should only allow putting files below directories.', function (done) {
	var nonDirName = '/dir';
	var fileName = '/dir/subfile';
	var initialFiles = [{path: nonDirName, is_dir: false}];
	var client = freshClient(initialFiles);
	return shouldContainFiles(client, initialFiles, 'did not find initial files in fresh client', function () {
	    return client.put(fileName, random_string(), function (err, meta) {
		assert.notEqual(err, 200, 'expected an error putting a file below a non-directory');
		return done();
	    });
	});
    });
});

mockFunctionTests('mv', minimalFileSet(), function (freshClient) {
    it('should move a file as requested', function (done) {
	var firstFileName = '/' + random_string();
	var secondFileName = '/' + random_string();
	var contents = random_string();
	var client = freshClient([{
	    path: firstFileName,
	    data: contents
	}]);
	return shouldContainFiles(client, {
	    path: firstFileName, 
	    data: contents,
	}, 'did not find expected file in client private files', function () {
	    return shouldNotContainFiles(client, secondFileName, 'unexpectedly found file in client private files', function () {
		return client.mv(firstFileName, secondFileName, function (err) {
		    return shouldNotContainFiles(client, firstFileName, 'unexpectedly found file in client private files after move', function () {
			return shouldContainFiles(client, {
			    path: secondFileName,
			    data: contents
			}, 'did not find file in client private files after move', 
						  done);
		    });
		});	 	    
	    });
	});
    });

    it('should move a file as requested (no slash)', function (done) {
	var firstFileName = random_string();
	var secondFileName = random_string();
	var contents = random_string();
	var client = freshClient([{
	    path: firstFileName,
	    data: contents
	}]);
	return shouldContainFiles(client, {
	    path: firstFileName, 
	    data: contents,
	}, 'did not find expected file in client private files', function () {
	    return shouldNotContainFiles(client, secondFileName, 'unexpectedly found file in client private files', function () {
		return client.mv(firstFileName, secondFileName, function (err) {
		    return shouldNotContainFiles(client, firstFileName, 'unexpectedly found file in client private files after move', function () {
			return shouldContainFiles(client, {
			    path: secondFileName,
			    data: contents
			}, 'did not find file in client private files after move', 
						  done);
		    });
		});	 	    
	    });
	});
    });

    it('should return 404 when attempting to  move a non-existant', function (done) {
	var firstFileName = '/' + random_string();
	var secondFileName = '/' + random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, firstFileName, 'did not find expected file in client private files', function () {
	    return client.mv(firstFileName, secondFileName, function (err) {
		assert.equal(err, 404, 'expected 404 status when trying to move a non-existant file');
		done();
	    });
	});	 	    
    });

    it('should return 404 when attempting to  move a non-existant (no slash)', function (done) {
	var firstFileName = random_string();
	var secondFileName = random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, firstFileName, 'did not find expected file in client private files', function () {
	    return client.mv(firstFileName, secondFileName, function (err) {
		assert.equal(err, 404, 'expected 404 status when trying to move a non-existant file');
		done();
	    });
	});	 	    
    });
});

mockFunctionTests('get', minimalFileSet(), function (freshClient) {
    it('should return null for empty file contents', function (done) {
	var fileName = '/' + random_string();
	var contents = random_string();
	var client = freshClient([{
	    path: fileName,
	}]);
	return client.get(fileName, function (err, data) {
	    assert.equal(err, 200, 'expected to get success status when requesting get on existing file');
	    assert.equal(data, null, 'expected to get null contents when file does not have data');
	    done();
	});
    });

    it('should return null for empty file contents (no slash)', function (done) {
	var fileName = random_string();
	var contents = random_string();
	var client = freshClient([{
	    path: fileName,
	}]);
	return client.get(fileName, function (err, data) {
	    assert.equal(err, 200, 'expected to get success status when requesting get on existing file');
	    assert.equal(data, null, 'expected to get null contents when file does not have data');
	    done();
	});
    });

    it('should return 404 status for non-existant file.', function (done) {
	var fileName = '/' + random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, fileName, 'unexpectedly found file in client private files', function () {
	    return client.get(fileName, function (err, data) {
		assert.equal(err, 404, 'expected to receive 404 when getting a non-existant file');
		done();
	    });
	});
    });

    it('should return 404 status for non-existant file. (no slash)', function (done) {
	var fileName = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, fileName, 'unexpectedly found file in client private files', function () {
	    return client.get(fileName, function (err, data) {
		assert.equal(err, 404, 'expected to receive 404 when getting a non-existant file');
		done();
	    });
	});
    });


    it('should return file contents.', function (done) {
	var fileName = '/' + random_string();
	var contents = random_string();
	var client = freshClient([{
	    path: fileName,
	    data: contents
	}]);
	return shouldContainFiles(client, fileName, 'did not find expected file in client private files', function () {
	    return client.get(fileName, function (err, data) {
		assert.equal(err, 200);
		assert.equal(data, contents);
		done();
	    });
	});
    });

    it('should return file contents. (no slash)', function (done) {
	var fileName = random_string();
	var contents = random_string();
	var client = freshClient([{
	    path: fileName,
	    data: contents
	}]);
	return shouldContainFiles(client, fileName, 'did not find expected file in client private files', function () {
	    return client.get(fileName, function (err, data) {
		assert.equal(err, 200);
		assert.equal(data, contents);
		done();
	    });
	});
    });
});

mockFunctionTests('cp', minimalFileSet(), function (freshClient) {
    it('should copy a file as requested', function (done) {
	var firstFileName = '/' + random_string();
	var secondFileName = '/' + random_string();
	var contents = random_string();
	var client = freshClient([{
	    path: firstFileName
	    , data: contents
	}]);
	return shouldContainFiles(client, {
	    path: firstFileName, 
	    data: contents,
	}, 'did not find expected file in client private files', function () {
	    return shouldNotContainFiles(client, secondFileName, 'unexpectedly found file in client private files', function () {
		return client.cp(firstFileName, secondFileName, function (err) {
		    return shouldContainFiles(client, [{
			path: firstFileName,
			data: contents
		    }, {
			path: secondFileName,
			data: contents
		    }], 'did not find expected file in client private files', done);
		});
	    });
	});	 	    
    });

    it('should move a file as requested (no slash)', function (done) {
	var firstFileName = random_string();
	var secondFileName = random_string();
	var contents = random_string();
	var client = freshClient([{
	    path: firstFileName,
	    data: contents
	}]);
	return shouldContainFiles(client, {
	    path: firstFileName, 
	    data: contents,
	}, 'did not find expected file in client private files', function () {
	    return shouldNotContainFiles(client, secondFileName, 'unexpectedly found file in client private files', function () {
		return client.cp(firstFileName, secondFileName, function (err) {
		    return shouldContainFiles(client, [{
			path: firstFileName,
			data: contents
		    }, {
			path: secondFileName,
			data: contents
		    }], 'did not find expected file in client private files', done);
		});
	    });
	});	 	    
    });

    it('should return 404 when attempting to copy a non-existant', function (done) {
	var firstFileName = '/' + random_string();
	var secondFileName = '/' + random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, firstFileName, 'did not find expected file in client private files', function () {
	    return client.cp(firstFileName, secondFileName, function (err) {
		assert.equal(err, 404, 'expected 404 status when trying to cp a non-existant file');
		done();
	    });	 	   
	}); 
    });

    it('should return 404 when attempting to copy a non-existant (no slash)', function (done) {
	var firstFileName = random_string();
	var secondFileName = random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, firstFileName, 'did not find expected file in client private files', function () {
	    return client.cp(firstFileName, secondFileName, function (err) {
		assert.equal(err, 404, 'expected 404 status when trying to cp a non-existant file');
		done();
	    });	 	   
	}); 
    });
});

mockFunctionTests('cpref', minimalFileSet(), function (freshClient) {
    it('should return 404 for non-existant file', function (done) {
	var fileName =  '/' + random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, fileName, 'unexpectedly found file in fresh client', function () {
	    return client.cpref(fileName, function (err, reply) {
		assert.equal(err, 404);
		assert(!reply);
		done();
	    });
	});
    });

    it('should return 404 for non-existant file (no slash)', function (done) {
	var fileName =  random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, fileName, 'unexpectedly found file in fresh client', function () {
	    return client.cpref(fileName, function (err, reply) {
		assert.equal(err, 404);
		assert(!reply);
		done();
	    });
	});
    });

    it('should successfully get copy_ref attribute for an existant file', function (done) {
	var client = freshClient();
	var fileName = '/file';
	return shouldContainFiles(client, fileName, 'did not find expected file in fresh client', function () {
	    return client.cpref(fileName, function (err, reply) {
		assert.equal(err, 200);
		assert(reply, 'expected a reply on cpref');
		assert(reply.hasOwnProperty('expires'), 'expected property expires on successful cpref reply');
		assert(reply.hasOwnProperty('copy_ref'), 'expected property copy_ref on successful cpref reply');
		done();
	    });
	});
    });

    it('should successfully get copy_ref attribute for an existant file (no slash)', function (done) {
	var client = freshClient();
	var fileName = 'file';
	return shouldContainFiles(client, fileName, 'did not find expected file in fresh client', function () {
	    return client.cpref(fileName, function (err, reply) {
		assert.equal(err, 200);
		assert(reply, 'expected a reply on cpref');
		assert(reply.hasOwnProperty('expires'), 'expected property expires on successful cpref reply');
		assert(reply.hasOwnProperty('copy_ref'), 'expected property copy_ref on successful cpref reply');
		done();
	    });
	});
    });
});

mockFunctionTests('metadata', minimalFileSet(), function (freshClient) {
    it('should successfully get metadata of existing file', function (done) {
	var client = freshClient();
	var fileName = '/file';
	return shouldContainFiles(client, fileName, 'did not find expected file in fresh client', function () {
	    return client.metadata(fileName, function (err, meta) {
		assert.equal(err, 200);
		assert(meta);
		assert(meta.hasOwnProperty('path'));
		assert.equal(meta.path, fileName);
		done();
	    });
	});
    });

    it('should successfully get metadata of existing file (no slash)', function (done) {
	var client = freshClient();
	var fileName = 'file';
	return shouldContainFiles(client, fileName, 'did not find expected file in fresh client', function () {
	    return client.metadata(fileName, function (err, meta) {
		assert.equal(err, 200);
		assert(meta);
		assert(meta.hasOwnProperty('path'));
		assert.equal(meta.path, normalizePath(fileName));
		done();
	    });
	});
    });

    it('should return 404 for non-existant file', function (done) {
	var fileName =  '/' + random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, fileName, 'unexpectedly found file in fresh client', function () {
	    return client.metadata(fileName, function (err, meta) {
		assert.equal(err, 404);
		assert(!meta);
		done();
	    });
	});
    });

    it('should return 404 for non-existant file (no slash)', function (done) {
	var fileName =  random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, fileName, 'unexpectedly found file in fresh client', function () {
	    return client.metadata(fileName, function (err, meta) {
		assert.equal(err, 404);
		assert(!meta);
		done();
	    });
	});
    });


    it('should successfully get metadata of randomly named existing file', function (done) {
	var fileName = '/' + random_string();
	var content = random_string();
	var client = freshClient([{path: fileName, is_dir: false, data: content}]);
	return shouldContainFiles(client, {
	    path: fileName, 
	    data: content
	}, 'did not find expected file in fresh client', function () {
	    return client.metadata(fileName, function (err, meta) {
		assert.equal(err, 200, 'expected success error status');
		assert(meta, 'exepcted to get a meta');
		assert(meta.hasOwnProperty('path'), 'all metas should have a path');
		assert.equal(meta.path, fileName, 'expected to get a meta with the requested path');
		assert(!meta.hasOwnProperty('data'), 'metas should not have the private data attribute.');
		done();
	    });
	});
    });

    it('should successfully get metadata of randomly named existing file (no slash)', function (done) {
	var fileName = random_string();
	var content = random_string();
	var client = freshClient([{path: fileName, is_dir: false, data: content}]);
	return shouldContainFiles(client, {
	    path: fileName, 
	    data: content
	}, 'did not find expected file in fresh client', function () {
	    return client.metadata(fileName, function (err, meta) {
		assert.equal(err, 200, 'expected success error status');
		assert(meta, 'exepcted to get a meta');
		assert(meta.hasOwnProperty('path'), 'all metas should have a path');
		assert.equal(meta.path, normalizePath(fileName), 'expected to get a meta with the requested path');
		assert(!meta.hasOwnProperty('data'), 'metas should not have the private data attribute.');
		done();
	    });
	});
    });

    it('should return metadata with a hash for directories', function (done) {
	var dirName = '/' + random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName, 'unexpectedly found file in fresh client', function () { 
	    return client.mkdir(dirName, function (err, meta) {
		assert.equal(err, 200, 'expected success response for mkdir.');
		assert(meta, 'expected meta data for newly created directory.');
		return client.metadata(dirName, function (err, meta) {
		    assert.equal(err, 200, 'expected success status for metadata query');
		    assert(meta, 'expected meta for existing dir metadata query');
		    assert(meta.hash, 'expected meta.hash for existing dir metadata query');
		    assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
		    done();
		});
	    });
	});
    });

    it('should return metadata with a hash for directories (no slash)', function (done) {
	var dirName = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName, 'unexpectedly found file in fresh client', function () { 
	    return client.mkdir(dirName, function (err, meta) {
		assert.equal(err, 200, 'expected success response for mkdir.');
		assert(meta, 'expected meta data for newly created directory.');
		return client.metadata(dirName, function (err, meta) {
		    assert.equal(err, 200, 'expected success status for metadata query');
		    assert(meta, 'expected meta for existing dir metadata query');
		    assert(meta.hash, 'expected meta.hash for existing dir metadata query');
		    assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
		    done();
		});
	    });
	});
    });

    it('should get 304 status for second metadata query with hash provided.', function (done) {
	var dirName = '/' + random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName,  'unexpectedly found file in fresh client', function () {
	    return client.mkdir(dirName, function (err, meta) {
		assert.equal(err, 200, 'expected success response for mkdir.');
		assert(meta, 'expected meta data for newly created directory.');
		return client.metadata(dirName, function (err, meta) {
		    assert.equal(err, 200, 'expected success status for metadata query');
		    assert(meta, 'expected meta for existing dir metadata query');
		    assert(meta.hash, 'expected meta.hash for existing dir metadata query');
		    assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
		    return client.metadata(dirName, {
			hash: meta.hash
		    }, function (err, meta) {
			assert.equal(err, 304, 'expected 304 status for metadata query');
			assert(!meta, 'expected no meta for existing dir metadata query with 304');
			done();
		    });
		});
	    });
	});
    });

    it('should get 304 status for second metadata query with hash provided. (no slash)', function (done) {
	var dirName = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName,  'unexpectedly found file in fresh client', function () {
	    return client.mkdir(dirName, function (err, meta) {
		assert.equal(err, 200, 'expected success response for mkdir.');
		assert(meta, 'expected meta data for newly created directory.');
		return client.metadata(dirName, function (err, meta) {
		    assert.equal(err, 200, 'expected success status for metadata query');
		    assert(meta, 'expected meta for existing dir metadata query');
		    assert(meta.hash, 'expected meta.hash for existing dir metadata query');
		    assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
		    return client.metadata(dirName, {
			hash: meta.hash
		    }, function (err, meta) {
			assert.equal(err, 304, 'expected 304 status for metadata query');
			assert(!meta, 'expected no meta for existing dir metadata query with 304');
			done();
		    });
		});
	    });
	});
    });

    it('should get new metadata and hash for second metadata query with hash provided after put.', function (done) {
	var dirName = '/' + random_string();
	var fileName = dirName + '/' + random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName,  'unexpectedly found file in fresh client', function () {
	    return client.mkdir(dirName, function (err, meta) {
		assert.equal(err, 200, 'expected success response for mkdir.');
		assert(meta, 'expected meta data for newly created directory.');
		return client.metadata(dirName, function (err, meta) {
		    assert.equal(err, 200, 'expected success status for metadata query');
		    assert(meta, 'expected meta for existing dir metadata query');
		    assert(meta.hash, 'expected meta.hash for existing dir metadata query');
		    assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
		    var firstHash = meta.hash;
		    return client.put(fileName, contents, function (err, meta) {
			assert.equal(err, 200, 'execpted success status when putting new file in existing dir.');
			assert(meta, 'exepcted metadata for new file put');
			return client.metadata(dirName, {
			    hash: firstHash
			}, function (err, meta) {
			    assert.equal(err, 200, 'expected success status for metadata query on changed directory.');
			    assert(meta, 'expected meta for existing dir metadata query after put.');
			    assert(meta.is_dir, 'expected is_dir for existing dir metadata query after put.');
			    assert(meta.contents, 'expected contents attribute for existing dir metadata query after put.');
			    assert.equal(meta.contents.length, 1, 'expected contents length 1 for existing dir metadata query after single put.');
			    assert(meta.contents[0].path, 1, 'expected meta.path in position 0 of dir metadata query after single put.');
			    assert.equal(meta.contents[0].path, fileName, 'expected meta.path to be the fileName in position 0 of dir metadata query after single put.');
			    done();
			});
		    });
		});

	    });
	});
    });

    it('should get new metadata and hash for second metadata query with hash provided after put. (no slash)', function (done) {
	var dirName = random_string();
	var fileName = dirName + '/' + random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName,  'unexpectedly found file in fresh client', function () {
	    return client.mkdir(dirName, function (err, meta) {
		assert.equal(err, 200, 'expected success response for mkdir.');
		assert(meta, 'expected meta data for newly created directory.');
		return client.metadata(dirName, function (err, meta) {
		    assert.equal(err, 200, 'expected success status for metadata query');
		    assert(meta, 'expected meta for existing dir metadata query');
		    assert(meta.hash, 'expected meta.hash for existing dir metadata query');
		    assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
		    var firstHash = meta.hash;
		    return client.put(fileName, contents, function (err, meta) {
			assert.equal(err, 200, 'execpted success status when putting new file in existing dir.');
			assert(meta, 'exepcted metadata for new file put');
			return client.metadata(dirName, {
			    hash: firstHash
			}, function (err, meta) {
			    assert.equal(err, 200, 'expected success status for metadata query on changed directory.');
			    assert(meta, 'expected meta for existing dir metadata query after put.');
			    assert(meta.is_dir, 'expected is_dir for existing dir metadata query after put.');
			    assert(meta.contents, 'expected contents attribute for existing dir metadata query after put.');
			    assert.equal(meta.contents.length, 1, 'expected contents length 1 for existing dir metadata query after single put.');
			    assert(meta.contents[0].path, 1, 'expected meta.path in position 0 of dir metadata query after single put.');
			    assert.equal(meta.contents[0].path, '/' + fileName, 'expected meta.path to be the fileName in position 0 of dir metadata query after single put.');
			    done();
			});
		    });
		});

	    });
	});
    });

    it('should get new metadata and hash for second metadata query with hash provided after cp.', function (done) {
	var dirName = '/' + random_string();
	var fileName = '/' + random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName, 'unexpectedly found file in fresh client', function () {
	    return client.mkdir(dirName, function (err, meta) {
		assert.equal(err, 200, 'expected success response for mkdir.');
		assert(meta, 'expected meta data for newly created directory.');
		return client.metadata(dirName, function (err, meta) {
		    assert.equal(err, 200, 'expected success status for metadata query');
		    assert(meta, 'expected meta for existing dir metadata query');
		    assert(meta.hash, 'expected meta.hash for existing dir metadata query');
		    assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
		    var firstHash = meta.hash;
		    return client.put(fileName, contents, function (err, meta) {
			assert.equal(err, 200, 'execpted success status when putting new file in existing dir.');
			assert(meta, 'exepcted metadata for new file put');
			return client.cp(fileName, dirName + fileName, function (err) {
			    assert.equal(err, 200, 'expected success copying file to new directory');
			    return client.metadata(dirName, {
				hash: firstHash
			    }, function (err, meta) {
				assert.equal(err, 200, 'expected success status for metadata query on changed directory.');
				assert(meta, 'expected meta for existing dir metadata query after put.');
				assert(meta.is_dir, 'expected is_dir for existing dir metadata query after put.');
				assert(meta.contents, 'expected contents attribute for existing dir metadata query after put.');
				assert.equal(meta.contents.length, 1, 'expected contents length 1 for existing dir metadata query after single put.');
				assert(meta.contents[0].path, 1, 'expected meta.path in position 0 of dir metadata query after single put.');
				assert.equal(meta.contents[0].path, dirName + fileName, 'expected meta.path to be the fileName in position 0 of dir metadata query after single put.');
				done();
			    });
			});			
		    });
		});
	    });
	});
    });

    it('should get new metadata and hash for second metadata query with hash provided after cp. (no slash)', function (done) {
	var dirName = random_string();
	var fileName = random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName, 'unexpectedly found file in fresh client', function () {
	    return client.mkdir(dirName, function (err, meta) {
		assert.equal(err, 200, 'expected success response for mkdir.');
		assert(meta, 'expected meta data for newly created directory.');
		return client.metadata(dirName, function (err, meta) {
		    assert.equal(err, 200, 'expected success status for metadata query');
		    assert(meta, 'expected meta for existing dir metadata query');
		    assert(meta.hash, 'expected meta.hash for existing dir metadata query');
		    assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
		    var firstHash = meta.hash;
		    return client.put(fileName, contents, function (err, meta) {
			assert.equal(err, 200, 'execpted success status when putting new file in existing dir.');
			assert(meta, 'exepcted metadata for new file put');
			return client.cp(fileName, dirName + '/' + fileName, function (err) {
			    assert.equal(err, 200, 'expected success copying file to new directory');
			    return client.metadata(dirName, {
				hash: firstHash
			    }, function (err, meta) {
				assert.equal(err, 200, 'expected success status for metadata query on changed directory.');
				assert(meta, 'expected meta for existing dir metadata query after put.');
				assert(meta.is_dir, 'expected is_dir for existing dir metadata query after put.');
				assert(meta.contents, 'expected contents attribute for existing dir metadata query after put.');
				assert.equal(meta.contents.length, 1, 'expected contents length 1 for existing dir metadata query after single put.');
				assert(meta.contents[0].path, 1, 'expected meta.path in position 0 of dir metadata query after single put.');
				assert.equal(meta.contents[0].path, '/' + dirName + '/' + fileName, 'expected meta.path to be the fileName in position 0 of dir metadata query after single put.');
				done();
			    });
			});			
		    });
		});
	    });
	});
    });

    it('should get new metadata and hash for second metadata query with hash provided after mv.', function (done) {
	var dirName = '/' + random_string();
	var fileName = '/file';
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName,  'unexpectedly found file in fresh client', function () {
	    return shouldContainFiles(client, fileName, 'did not fine expected file in fresh client', function () {
		return client.mkdir(dirName, function (err, meta) {
		    assert.equal(err, 200, 'expected success response for mkdir.');
		    assert(meta, 'expected meta data for newly created directory.');
		    return client.metadata(dirName, function (err, meta) {
			assert.equal(err, 200, 'expected success status for metadata query');
			assert(meta, 'expected meta for existing dir metadata query');
			assert(meta.hash, 'expected meta.hash for existing dir metadata query');
			assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
			var firstHash = meta.hash;
			return client.mv(fileName, dirName + fileName, function (err) {
			    assert.equal(err, 200, 'expected success copying file to new directory');
			    return client.metadata(dirName, {
				hash: firstHash
			    }, function (err, meta) {
				assert.equal(err, 200, 'expected success status for metadata query on changed directory.');
				assert(meta, 'expected meta for existing dir metadata query after put.');
				assert(meta.is_dir, 'expected is_dir for existing dir metadata query after put.');
				assert(meta.contents, 'expected contents attribute for existing dir metadata query after put.');
				assert.equal(meta.contents.length, 1, 'expected contents length 1 for existing dir metadata query after single put.');
				assert(meta.contents[0].path, 1, 'expected meta.path in position 0 of dir metadata query after single put.');
				assert.equal(meta.contents[0].path, dirName + fileName, 'expected meta.path to be the fileName in position 0 of dir metadata query after single put.');
				done();
			    });
			});
		    });			
		});
	    });
	});
    });

    it('should get new metadata and hash for second metadata query with hash provided after mv. (no slash)', function (done) {
	var dirName = random_string();
	var fileName = 'file';
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName,  'unexpectedly found file in fresh client', function () {
	    return shouldContainFiles(client, fileName, 'did not fine expected file in fresh client', function () {
		return client.mkdir(dirName, function (err, meta) {
		    assert.equal(err, 200, 'expected success response for mkdir.');
		    assert(meta, 'expected meta data for newly created directory.');
		    return client.metadata(dirName, function (err, meta) {
			assert.equal(err, 200, 'expected success status for metadata query');
			assert(meta, 'expected meta for existing dir metadata query');
			assert(meta.hash, 'expected meta.hash for existing dir metadata query');
			assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
			var firstHash = meta.hash;
			return client.mv(fileName, dirName + '/' + fileName, function (err) {
			    assert.equal(err, 200, 'expected success copying file to new directory');
			    return client.metadata(dirName, {
				hash: firstHash
			    }, function (err, meta) {
				assert.equal(err, 200, 'expected success status for metadata query on changed directory.');
				assert(meta, 'expected meta for existing dir metadata query after put.');
				assert(meta.is_dir, 'expected is_dir for existing dir metadata query after put.');
				assert(meta.contents, 'expected contents attribute for existing dir metadata query after put.');
				assert.equal(meta.contents.length, 1, 'expected contents length 1 for existing dir metadata query after single put.');
				assert(meta.contents[0].path, 1, 'expected meta.path in position 0 of dir metadata query after single put.');
				assert.equal(meta.contents[0].path, '/' + dirName + '/' + fileName, 'expected meta.path to be the fileName in position 0 of dir metadata query after single put.');
				done();
			    });
			});
		    });			
		});
	    });
	});
    });


    it('should get new metadata and hash for second metadata query with hash provided after rm.', function (done) {
	var dirName = '/' + random_string();
	var fileName = '/' + random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName,  'unexpectedly found file in fresh client', function () {
	    return client.mkdir(dirName, function (err, meta) {
		assert.equal(err, 200, 'expected success response for mkdir.');
		assert(meta, 'expected meta data for newly created directory.');
		return client.put(dirName + fileName, contents, function (err, meta) {
		    assert.equal(err, 200, 'execpted success status when putting new file in existing dir.');
		    assert(meta, 'exepcted metadata for new file put');
		    return client.metadata(dirName, function (err, meta) {
			assert.equal(err, 200, 'expected success status for metadata query');
			assert(meta, 'expected meta for existing dir metadata query');
			assert(meta.hash, 'expected meta.hash for existing dir metadata query');
			assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
			var firstHash = meta.hash;
			return client.rm(dirName + fileName, function (err) {
			    assert.equal(err, 200, 'expected success removing file in directory');
			    return client.metadata(dirName, {
				hash: firstHash
			    }, function (err, meta) {
				assert.equal(err, 200, 'expected success status for metadata query on changed directory.');
				assert(meta, 'expected meta for existing dir metadata query after put.');
				assert(meta.is_dir, 'expected is_dir for existing dir metadata query after put.');
				assert(meta.contents, 'expected contents attribute for existing dir metadata query after put.');
				assert.equal(meta.contents.length, 0, 'expected contents length 10for existing dir metadata query after only file rm.');
				done();
			    });
			});			
		    });
		});
	    });
	});
    });

    it('should get new metadata and hash for second metadata query with hash provided after rm. (no slash)', function (done) {
	var dirName = random_string();
	var fileName = random_string();
	var contents = random_string();
	var client = freshClient();
	return shouldNotContainFiles(client, dirName,  'unexpectedly found file in fresh client', function () {
	    return client.mkdir(dirName, function (err, meta) {
		assert.equal(err, 200, 'expected success response for mkdir.');
		assert(meta, 'expected meta data for newly created directory.');
		return client.put(dirName + '/' + fileName, contents, function (err, meta) {
		    assert.equal(err, 200, 'execpted success status when putting new file in existing dir.');
		    assert(meta, 'exepcted metadata for new file put');
		    return client.metadata(dirName, function (err, meta) {
			assert.equal(err, 200, 'expected success status for metadata query');
			assert(meta, 'expected meta for existing dir metadata query');
			assert(meta.hash, 'expected meta.hash for existing dir metadata query');
			assert(meta.is_dir, 'expected meta.is_dir for existing dir metadata query');
			var firstHash = meta.hash;
			return client.rm(dirName + '/' + fileName, function (err) {
			    assert.equal(err, 200, 'expected success removing file in directory ' + dirName + '/' + fileName + ' status: ' + err);
			    return client.metadata(dirName, {
				hash: firstHash
			    }, function (err, meta) {
				assert.equal(err, 200, 'expected success status for metadata query on changed directory.');
				assert(meta, 'expected meta for existing dir metadata query after put.');
				assert(meta.is_dir, 'expected is_dir for existing dir metadata query after put.');
				assert(meta.contents, 'expected contents attribute for existing dir metadata query after put.');
				assert.equal(meta.contents.length, 0, 'expected contents length 10for existing dir metadata query after only file rm.');
				done();
			    });
			});			
		    });
		});
	    });
	});
    });
});
