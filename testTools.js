var mockclientmod = require('./mockclient');
var mockclient = mockclientmod.mockclient;
var assert = require('assert');
var crypto = require('crypto');
var _ = require('underscore');
var pathmod = require('path');
var metadatamod = require('./metadata');

var normalizePath = mockclientmod.normalizePath;

var random_string = exports.random_string = function () {
    return crypto.randomBytes(12).toString('hex');
};

exports.clientFactory = function (initialFiles) {
    initialFiles = _.clone(initialFiles);
    return function (theseFiles) {
	if (!theseFiles) {
	    theseFiles = [];
	}

	return mockclient(_.flatten([ _.clone(_.filter(initialFiles, function (file) {
	    return !_.find(theseFiles, function (otherFile) {
		return normalizePath(file.path) === normalizePath(otherFile.path);
	    });
	}))
				      , _.clone(theseFiles)
				    ]));
    };
};

var skewedRandomInt = exports.skewedRandomInt = mockclientmod.skewedRandomInt;


var randomFile = exports.randomFile = function (parentPath) {
    return {path: pathmod.join(parentPath, random_string()), data: random_string(), is_dir: false};
};

var randomDirectoryTree = exports.randomDirectoryTree = function (path, options) {
    options = _.clone(options);

    var components = [[{path: path, is_dir: true}]];
    var fileCount = skewedRandomInt(options.maxFilesInDir + 1);
    for (var count = 0; count < fileCount; count++)
    {
	components.push([randomFile(path)]);
    }


    if (options.maxLevels > 0) {
	options.maxLevels = skewedRandomInt(options.maxLevels);
	var branchCount = skewedRandomInt(options.maxBranch + 1);
	for (var count = 0; count < branchCount; count++)
	{
	    var dirname = random_string();
	    components.push(randomDirectoryTree(pathmod.join(path, dirname), options));
	}
    }

    return _.flatten(components);
};

var randomFileTree = exports.randomFileTree = function (options) {
    options = _.defaults(options || {}, {
	maxFilesInDir: 10
	, maxLevels: 3
	, maxBranch: 4
    });

    return metadatamod.fileset(randomDirectoryTree('/', options));
};

var randomPick = exports.randomPick = function (arr) {
    if (arr.length < 1) {
	throw 'unable to pick from an empty array.'
    }
    var idx = Math.floor(arr.length * Math.random());
    return arr[idx];
};
