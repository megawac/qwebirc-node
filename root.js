#!/bin/env node

var express = require('express');
var DEBUG = true;

/**
 *  Define the sample application.
 */
var Qwebirc = function() {

    //  Scope.
    var self = this;

    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    self.setupVariables = function() {
        //  Set the environment variables we need.
        self.port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080;
    };

    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        if (typeof sig === "string") {
           console.log('%s: Received %s - terminating sample app ...',
                       Date(Date.now()), sig);
           process.exit(1);
        }
        console.log('%s: Node server stopped.', Date(Date.now()) );
    };


    /**
     *  Setup termination handlers (for exit and a list of signals).
     */
    self.setupTerminationHandlers = function(){
        //  Process on exit and signals.
        process.on('exit', function() { self.terminator(); });

        // Removed 'SIGPIPE' from the list - bugz 852598.
        ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
         'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
        ].forEach(function(element, index, array) {
            process.on(element, function() { self.terminator(element); });
        });
    };

    /**
     *  Start the server (starts up the sample application).
     */
    self.start = function() {
        //  Start the app on the specific interface (and port).
        self.app.listen(self.port);
        var io = require('socket.io').listen(80);
        if(!DEBUG) {
            io.set("log level", 1);
        }
        io.sockets.on('connection', function (socket) {
            
            socket.once('irc', function(nick, opts) {//connect to the server
                var timers = {};
                var irc  = require('./irc.js');

                var client = new irc.Client(
                    'irc.gamesurge.net',
                    nick || 'testaccount',
                    opts
                );

                client.addListener('raw', function(message) {
                    socket.emit("raw", {
                        raw: message
                    });
                });

                socket.on("send", function(data) {
                    client.send(data, true);
                });

                socket.on("quit", function() {
                    client.disconnect();
                });

                socket.on("disconnect", function() {//wait a bit for a reconnect
                    timers.quitting = setTimeout(function() {
                        client.disconnect();
                        delete timers.quitting;
                    }, 120 * 1000);
                });

                socket.on("retry", function() {
                    if(timers.quitting) {
                        socket.emit("connected");
                        clearTimeout(timers.quitting);
                    }
                    else {
                        client.connect();
                    }
                });

                socket.emit("connected");
            });
            socket.on("echo", function(data) {
                socket.emit("echo", data);
            });
        });
    };

    /**
     *  Initialize the server (express) and create the routes and register
     *  the handlers.
     */
    self.initializeServer = function() {
        self.app = express();
        // compress content
        self.app.use(express.compress());
        self.app.use(express.static(__dirname + '/static', { maxAge: 1 }));
    };


    self.setupVariables();
    // self.setupTerminationHandlers();
    self.initializeServer();
};

// run server
var server = new Qwebirc();
server.start();
