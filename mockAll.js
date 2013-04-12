var fs     = require("fs")
var should = require("should")
var prompt = require("prompt")
var mockclient = require('./mockclient').mockclient;

var crypto = require('crypto');

var random_string = function (cb) {
    return crypto.randomBytes(12, function(ex, buf) {
	cb(buf.toString('hex'));
    });
};

var testClient = function (creds, cb) {
    return cb(mockclient([{ path: '/', is_dir: true}]));
};


describe("all", function(){
    var ref;
    var client;
    
    before(function(done) {
	testClient(null, function (newClient) {
	    client = newClient;
	    done();
	});
    });

    it("should create a directory", function(done) { 
	client.mkdir("myfirstdir", function(status, reply){
	    status.should.eql(200)
	    done()
	})
    })
    
    it("should remove a directory", function(done) {
	client.rm("myfirstdir", function(status, reply){
	    status.should.eql(200)
	    done()
	})
    })
    
    it("should create a file", function(done) {
	client.put("myfirstfile.txt", "Hello World", function(status, reply){
	    status.should.eql(200)
	    done()
	})
    })
    
    it("should move a file", function(done) {
	client.mv("myfirstfile.txt", "myrenamedfile.txt", function(status, reply){
	    status.should.eql(200)
	    done()
	})
    })
    
    it("should get contents of file", function(done) {
	client.get("myrenamedfile.txt", function(status, reply){
	    status.should.eql(200)
	    reply.toString().should.eql("Hello World")
	    done()
	})
    })
    
    it("should change file", function(done) {
	client.put("myrenamedfile.txt", "Hello Brazil", function(status, reply){
	    status.should.eql(200)
	    done()
	})
    })
    
    it("should copy file", function(done) {
	client.cp("myrenamedfile.txt", "myclonefile.txt", function(status, reply){
	    status.should.eql(200)
	    done()
	})
    })
    
    it("should get refrence from file from cpref", function(done) {
	client.cpref("myrenamedfile.txt", function(status, reply){
	    status.should.eql(200)
	    reply.should.have.property('expires')
	    reply.should.have.property('copy_ref')
	    ref = reply
	    done()
	})
    })
    
    it("should copy file from ref", function(done) {
	client.cp(ref, "myclonefilefromref.txt", function(status, reply){
	    status.should.eql(200)
	    done()
	})
    })
    
    it("should remove renamed file", function(done) {
	client.rm("myrenamedfile.txt", function(status, reply){
	    status.should.eql(200)
	    done()
	})
    })
    
    it("should remove cloned file", function(done) {
	client.rm("myclonefile.txt", function(status, reply){
	    status.should.eql(200)
	    done()
	})
    })
    
    it("should remove cloned file from ref", function(done) {
	client.rm("myclonefilefromref.txt", function(status, reply){
	    status.should.eql(200)
	    done()
	})
    })

    
    after(function(){
	//console.log("after step")
    })

});