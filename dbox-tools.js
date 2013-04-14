

var _ = require('underscore');
var metadatamod = require('./metadata')

var updateMetadata = exports.updateMetadata = function (cli, metadata, targets, cb) {
    metadata = metadatamod.fileset(metadata);

    var path;
    if (targets.hasOwnProperty('path')) {
	path = targets.path;
    }
    else if (typeof targets === 'string') {
	path = targets;
    }
    else {
	throw 'unexpected targets type: ' + typeof targets;
    }
    var oldMeta = null;
    var options = {};
    if (metadata.hasOwnProperty(path) && metadata[path].hasOwnProperty('hash')) {
	options.hash = metadata[path].hash;
    }
    return cli.metadata(path, options, function (err, meta) {
	if (err === 200) {
	    metadatamod.changePath(metadata, path, meta)
	}
	else if (err === 404) {
	    metadatamod.rm(metadata, path);
	}
	else if (err === 304) {}
	else {
	    return cb('unexpected error getting client metadata for path ' + path + ' : ' + err);
	}
	return cb(null, metadata);
    });
};

exports.delta = function (cli, cursor, options) {
    options = _.defaults(options || {}, {
	reset:  function (cb) { return cb() },
	deltas: function (delta_list, cb) { return cb() },
	done: function (err, newCursor) { 
	    if (err) {
		console.log('delta error ', err);
	    }
	}
    });
    (function delta_loop (cursor) {
	return cli.delta({cursor: cursor}, function (status, delta) {
	    if (status !== 200) {
		return options.done({
		    name: 'error',
		    message: 'delta returned status ' + status,
		    status: status
		});
	    }

	    var processEntries = function () {
		var delta_list = delta.entries;
		return options.deltas(delta_list, function () {
		    if (delta.has_more) { 
			return delta_loop(delta.cursor);
		    }
		    else {
			return options.done(null, delta.cursor);
		    }
		    
		});
	    };

	    if (delta.reset) {
		return options.reset(processEntries);
	    }
	    else {
		return processEntries();
	    }

	});
    })(cursor);
};