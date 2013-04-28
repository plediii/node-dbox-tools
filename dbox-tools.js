

var _ = require('underscore');
var metadatamod = require('./metadata')

var toPathArray = exports.toPathArray = function toPathArray (paths) {
    if (typeof paths === 'string') {
	return [paths];
    }
    else if (paths.hasOwnProperty('path')) {
	return [paths.path];
    }
    else {
	return _.chain(paths)
	    .map(toPathArray)
	    .flatten()
	    .map(function (elt) {
		if (typeof elt !== 'string') {
		    throw 'unable to convert to path array: ' + JSON.stringify(paths);
		}
		return elt;
	    })
	    .value();
    }
};

var getDelta = exports.getDelta = function (cli, metadata, targets, cb) {
    var deltas = [];
    
    return (function getDeltaLoop (targets) {
	if (targets.length < 1) {
	    return cb(null, deltas);
	}
	var target = _.head(targets);
	var resume = function () {
	    return getDeltaLoop(_.rest(targets));
	};

	var currentMeta = metadata[target];
	var options = {};
	if (currentMeta && currentMeta.is_dir) {
	    options.hash = currentMeta.hash;
	}

	return cli.metadata(target, options, function (err, meta) {
	    if (err === 404) {
		if (currentMeta) {
		    deltas.push([target, null]);
		}
		return resume();
	    }
	    else if (err === 200) {
		if (!currentMeta 
		    || currentMeta.rev !== meta.rev) {
		    if (meta.contents) {
			delete meta.contents;
		    }
		    deltas.push([target, meta]);
		}
		return resume();
	    }
	    else if (err === 304) {
		return resume();
	    }
	    else {
		return cb('unexpected error getting client metadata for path ' + target + ' : ' + err);
	    }
	});
    })(toPathArray(targets));
};

var updateMetadata = exports.updateMetadata = function (cli, metadata, targets, cb) {
    return getDelta(cli, metadata, targets, function (err, delta) {
	if (err) {
	    return cb(err);
	}
	else {
	    return cb(null, metadatamod.applyDelta(delta, metadatamod.fileset(metadata)));
	}
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