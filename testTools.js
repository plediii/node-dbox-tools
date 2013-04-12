var mockclientmod = require('./mockclient');
var mockclient = mockclientmod.mockclient;
var assert = require('assert');
var crypto = require('crypto');
var _ = require('underscore');

var normalizePath = mockclientmod.normalizePath;

exports.random_string = function () {
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

