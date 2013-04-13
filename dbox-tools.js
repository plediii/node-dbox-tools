

var _ = require('underscore');

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