

var _ = require('underscore');

exports.delta = function (cli, cursor, options) {
    options = _.defaults(options || {}, {
	reset:  function (cb) {},
	change: function (path, mod, cb) {},
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
		
		return (function processRemainingEntries (entries) {
		    if (entries.length < 1) {
			if (delta.has_more) { 
			    return delta_loop(delta.cursor);
			}
			else {
			    return options.done(null, delta.cursor);
			}
		    }
		    var entry = _.head(entries);
		    var path = entry[0];
		    var meta = entry[1];

		    options.change(path, meta, function () {
			return processRemainingEntries(_.rest(entries));
		    });
		})(delta.entries);
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