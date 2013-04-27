
var metadatamod = require('./metadata');
var mockclient = require('./mockclient').mockclient;
var dt = require('./dbox-tools');
var _ = require('underscore');
var assert = require('assert');
var pathmod = require('path');
var tt = require('./testTools')
var temp = require('temp');
var fs = require('fs');

var withRandomClient = function (cb) {
    var initialFiles = tt.randomFileTree();

    return cb(mockclient(initialFiles), initialFiles);
};

describe('filecontroller', function () {

    var checkUpdated = function (client, rootPath, targets, cb) {
	var notUpdatedArr = [];
	var notUpdated = function (path, message) {
	    if (!message) { message = ''; }
	    notUpdatedArr.push(path + ';' + pathmod.join(path, rootPath) + ': ' + message);
	    return path;
	};

	var nothingType = 'nothing';
	var nothingInfo = function (path) {
	    return {type: nothingType
		    , path: path};
	};
	var fileType = 'file';
	var fileInfo = function (path, contents) {
	    return {type: fileType
		    , path: path
		    , contents: contents
		   };
	};
	var dirType = 'directory';
	var dirInfo = function (path, list) {
	    return {type: dirType
		    , path: path
		    , list: list
		   };
	};

	var getLocalFileInfo = function (path, cb) {
	    var localPath = pathmod.join(rootPath, path);
	    return fs.exists(localPath, function (exists) {
		if (!exists) {
		    return cb(nothingInfo(localPath));
		}
		return fs.stat(localPath, function (err, stat) {
		    if (err) {
			throw err;
		    }
		    if (stat.isDirectory()) {
			return fs.readdir(localPath, function (err, files) {
			    if (err) {
				throw err;
			    }
			    return cb(dirInfo(localPath, files));
			});
		    }
		    else if (stat.isFile()) {
			return fs.readFile(localPath, function (err, content) {
			    if (err) {
				throw err;
			    }
			    return cb(fileInfo(localPath, content));
			});
		    }
		    else {
			throw 'unrecognized stat type: ' + JSON.stringify(stat);
		    }
		});
	    });
	};

	var getClientFileInfo = function (path, cb) {
	    return client.metadata(path, function (err, meta) {
		if (err === 200) {
		    if (meta.is_dir) {
			return cb(dirInfo(path
					  , _.map(meta.contents, function (subPath) { return pathmod.basename(subPath); }))
				  , meta);
		    }
		    else {
			return client.get(path, function (err, data) {
			    return cb(fileInfo(path, data), meta);
			});
		    }
		}
		else if (err === 404) {
		    return cb(nothingInfo(path));
		}
		else {
		    throw 'unrecognized err from client.metadata: ' + err;
		}
	    });
	};


	return (function checkLoop (targets) {
	    if (targets.length < 1) {
		return cb(notUpdated);
	    }
	    var path = _.head(targets);
	    var localPath = pathmod.join(rootPath, path);

	    var resume = function () {
		return checkLoop(_.rest(targets));
	    };

	    return getLocalFileInfo(path, function (localInfo) {
		return getClientFileInfo(path, function (clientInfo, metadata) {
		    if (localInfo.type !== clientInfo.type) {
			notUpdatedArr.push('different types ' + JSON.stringify(localInfo) + ' '+ JSON.stringify(clientInfo));
			return resume();
		    }
		    else if (localInfo.type === fileType) {
			if ('' + localInfo.contents !== '' + clientInfo.contents) {
			    notUpdatedArr.push('different file contents ' + JSON.stringify(localInfo) + ' '+ JSON.stringify(clientInfo));
			}
			return resume();
		    }
		    else if (localInfo.type === dirType) {
			var missingFiles = _.difference(clientInfo.list, localInfo.list);
			if (missingFiles.length > 0) {
			    notUpdatedArr.push('different directory list ' + JSON.stringify(localInfo) + ' '+ JSON.stringify(clientInfo));
			    return resume();
			}
			else {
			    return (function checkLoop (subMetas) {
				if (subMetas.length < 1) {
				    return resume();
				}
				var resumeCheck = function () {
				    return checkLoop(_.rest(subMetas));
				};

				var subMeta = _.head(subMetas);
				return getLocalInfo(subMeta.path, function (info) {
				    if (info.type === nothingType) {
					notUpdatedArr.push('sub path ' + subMeta.path + ' does not exist ' + JSON.stringify(localInfo) + ' '+ JSON.stringify(clientInfo));
					return resumeCheck();
				    }
				    else if (info.type === dirType) {
					// if it's a directory, we just need to know that it exists
					if (!subMeta.is_dir) {
					    notUpdatedArr.push('sub path ' + subMeta.path + ' is not a dir ' + JSON.stringify(localInfo) + ' '+ JSON.stringify(clientInfo));
					    return resumeCheck();
					}
				    }
				    else {
					// if it's a file, it should have been completely updated
					return checkUpdated(client, rootPath, [path], function (diffs) {
					    notUpdatedArr = notUpdatedArr.concat(diffs);
					    return resumeCheck();
					});
				    }
				});
			    })(metadata.contents);
			}
			if ('' + localInfo.contents !== '' + clientInfo.contents) {
			    notUpdatedArr.push('different file contents ' + JSON.stringify(localInfo) + ' '+ JSON.stringify(clientInfo));
			}
		    }
		});
	    });


	    // need to differentiate between file and directory
	    return fs.exists(localPath, function (exists) {	    
		return client.get(path, function (err, clientData, clientMeta) {
		    if (err === 404) {
			if (exists) {
			    notUpdated(path);
			    return resume();
			}
		    }
		    else if (err === 200) {
			// the local file contents should agree
			if (!exists) {
			    notUpdated(path);
			}
			return fs.readFile(localPath, contents, function (err, data) {
			    if (err) {
				throw err;
			    }
			    if (data.toString() !== clientData.toString()) {
				notUpdated(path);
			    }
			    return resume();
			});
		    }
		    else {
			throw 'unexpected error from client.get ' + path + ' : ' + err;
		    }
		});
	    });
	})(dt.toPathArray(targets));
    };

    var assertUpdated = function (client, rootPath, targets, cb) {
	return checkUpdated(client, rootPath, targets, function (differences) {
	    if (differences.length > 0) {
		throw 'there were differences: ' + differences;
	    }
	});
    };

    var assertNotUpdated = function (client, rootPath, targets, cb) {
	return checkUpdated(client, rootPath, targets, function (differences) {
	    if (differences.length < 1) {
		throw 'there were no differences.';
	    }
	});
    };

    it('should download a specific requested path', function (done) {
	return withRandomClient(function (client, initialMetadata) {
	    return temp.mkdir('filecontrollertest', function (err, dirPath) {
		if (err) {
		    throw err;
		}
		var fc = dt.fileController(dirPath);
		var targetMeta = tt.randomPick(_.where(_.toArray(initialMetadata), {is_dir: false}));
		assert(targetMeta, 'need a file to test with.');
		return fc.downSync(client, targetMeta, function (updatedMetas) {
		    return assertUpdated(client, dirPath, targetMeta, done);
		});
	    });
	});
    });

    it('should return the delta for the single updated file', function (done) {
	return withRandomClient(function (client, initialMetadata) {
	    return temp.mkdir('filecontrollertest', function (err, dirPath) {
		if (err) {
		    throw err;
		}
		var fc = dt.fileController(dirPath);
		var targetMeta = tt.randomPick(_.where(_.toArray(initialMetadata), {is_dir: false}));
		assert(targetMeta, 'need a file to test with.');
		return fc.downSync(client, {path: targetMeta.path}, function (deltas) {
		    assert.equal(deltas.length, 1, 'expected to receive a single delta when a single existing path is requested from a new filecontroller.');
		    var updatedMeta = deltas[0][1];
		    assert(updatedMeta, 'expected to get a change delta');
		    assert(_.isEqual(updatedMeta, targetMeta), 'expected the get the initial metadata because there were no changes to the initial set');
		    return done();
		});
	    });
	});
    });

    it('should download a specific requested directory', function (done) {
	return withRandomClient(function (client, initialMetadata) {
	    return temp.mkdir('filecontrollertest', function (err, dirPath) {
		if (err) {
		    throw err;
		}
		var fc = dt.fileController(dirPath);
		var targetMeta = tt.randomPick(_.where(_.toArray(initialMetadata), {is_dir: true}));
		assert(targetMeta, 'need a file to test with.');
		return fc.downSync(client, targetMeta, function (deltas) {
		    assert.equal(deltas.length, 1, 'expected to receive a single delta when a single existing path is requested from a new filecontroller.');	    
		    return assertUpdated(client, dirPath, deltas[0][0], done);
		});
	    });
	});
    });

    it('should not update outside a specific requested directory', function (done) {
	return withRandomClient(function (client, initialMetadata) {
	    return temp.mkdir('filecontrollertest', function (err, dirPath) {
		if (err) {
		    throw err;
		}
		var fc = dt.fileController(dirPath);
		var targetMeta = tt.randomPick(_.where(_.toArray(initialMetadata), {is_dir: true}));
		assert(targetMeta, 'need a file to test with.');
		var targetPath = targetMeta.path;
		return fc.downSync(client, targetMeta, function (deltas) {
		    var fileMetas = _.where(initialMetadata, {is_dir: false});
		    var filesInDirectory = _.filter(fileMetas
						    , function (meta) {
							return pathmod.dirname(meta.path) === targetPath
						    });
		    var filesNotInDirectory = _.filter(fileMetas
						    , function (meta) {
							return pathmod.dirname(meta.path) !== targetPath
						    });
		    return assertUpdated(client, dirPath, filesInDirectory, function () {
			return assertNotUpdated(client, dirPath, filesNotInDirectory, done);
		    });
		});
	    });
	});
    });

    it('should not update a target path if target rev has not changed', function (done) {
	return withRandomClient(function (client, initialMetadata) {
	    var initialCopy = metadatamod.fileset(initialMetadata);
	    return temp.mkdir('filecontrollertest', function (err, dirPath) {
		if (err) {
		    throw err;
		}
		var fc = dt.fileController(dirPath);
		return fc.downSync(client, initialMetadata, function (deltas) {
		    return tt.randomModify(client, initialMetadata, 10, function (moddeltas) {
			return fc.downSync(client, initialMetadata, function (deltas2) {
			    return assertNotUpdated(client, dirPath, initialCopy, done);
			});
		    });
		});
	    });
	});	
    });

    it('should not update specific target if just that target rev has not changed', function (done) {
	return withRandomClient(function (client, initialMetadata) {
	    var initialCopy = metadatamod.fileset(initialMetadata);
	    return temp.mkdir('filecontrollertest', function (err, dirPath) {
		if (err) {
		    throw err;
		}
		var fc = dt.fileController(dirPath);
		return fc.downSync(client, initialMetadata, function (deltas) {
		    return tt.randomModify(client, initialMetadata, 10, function (moddeltas) {
			var changedFileMetas = _.filter(initialMetadata
							, function (meta) { return !meta.is_dir && getChange(meta.path, moddeltas); });
			if (changedFileMetas.length < 1) {
			    console.log('WARNING: No updated file path.');
			    return done();
			}
			var excludedMeta = tt.randomPick(changedFileMetas);
			return dt.updateMetadata(client, initialMetadata, initialMetadata, function (latestMetadata) {
			    var targetMetas = _.chain(latestMetadata)
				.where({is_dir: false})
				.filter(function (meta) { return meta.path !== excludedMeta.path })
				.value();
			    targetMetas.push(excludedMeta);
			    return fc.downSync(client, targetMetas, function (deltas2) {
				return assertNotUpdated(client, dirPath, excludedMeta, function () {
				    return assertUpdated(client, dirPath, _.without(targetMetas, excludedMeta), done);
				});
			    });
			});
		    });
		});
	    });
	});	
    });

    it('should be able to update root path', function (done) {
	return withRandomClient(function (client, initialMetadata) {
	    return temp.mkdir('filecontrollertest', function (err, dirPath) {
		if (err) {
		    throw err;
		}
		var fc = dt.fileController(dirPath);
		var targetMeta = '/';
		return fc.downSync(client, targetMeta, function (deltas) {
		    return assertUpdated(client, dirPath, targetMeta, done);
		});
	    });
	});
    });

    it('should not  update root path', function (done) {
	return withRandomClient(function (client, initialMetadata) {
	    return temp.mkdir('filecontrollertest', function (err, dirPath) {
		if (err) {
		    throw err;
		}
		var fc = dt.fileController(dirPath);
		var targetMeta = '/';
		return fc.downSync(client, targetMeta, function (deltas) {
		    return assertUpdated(client, dirPath, targetMeta, done);
		});
	    });
	});
    });


});

