#!/bin/env node

var express = require('express');
var http = require('http');
var util = require('util');
var _ = require('underscore');

/**
 *  Define the sample application.
 */
var Qwebirc = function(options) {

    //  Scope.
    var self = this;
    self.options = _.extend({
        DEBUG: true,
        IRCPORT: 6667, //irc servers port
        USE_WEBSOCKETS: true, //whether to use websockets - some servers dont support the protocol. Fallbacks are done through socket.io
        MAX_CONNETIONS: Infinity,
        APP_PORT: process.env.PORT || 8080,
        root: process.cwd(),

        httpTimeout: 60000 //time in ms before we drop a clients socket
    }, options);

    if(!self.options.IRCSERVER) throw "init without irc server";

    self.clients = {};//hash of clients (clientIds)
    self.connections = 0;

    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        console.log("ending" + sig);
        if (typeof sig === "string") {
            var message = Date(Date.now()) + ': Received %s - terminating app ... '+ sig;
            util.log(message);

            process.exit(1);
        }

        _.each(self.clients, function(client, id) {
            client.client.quit();
            delete self.clients[id];
        });

        util.log('%s: Node server stopped.', Date(Date.now()) );
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
        //http://stackoverflow.com/questions/10191048/socket-io-js-not-found/10192084#10192084
        var options  = self.options;
        //  Start the app on the specific interface (and port).
        self.server.listen(options.APP_PORT);
        var io = require('socket.io').listen(self.server);
        io.configure(function() {
            if(!options.DEBUG) {
                io.set("log level", 1);
            }
            if(!options.USE_WEBSOCKETS) {
                io.set("transports", ["xhr-polling"]);
                io.set("polling duration", 10);
            }
        });
        io.sockets.on('connection', function (socket) {
            var address = socket.handshake.address;
            var clientid;
            util.log('\n\nConnection from ' + address.address + ':' + address.port + "\n\n ---- Open connections: " + self.connections + "\n\n");
            if(self.connections + 1 >= self.options.MAX_CONNETIONS) {
                socket.emit('max_connections');
                socket.disconnect();
            }

            function connect(ircopts) {
                var irc  = require('./irc.js');
                clientid = ircopts.clientID;
                var client = new irc.Client(
                    options.IRCSERVER,
                    ircopts
                );

                listen(client);

                self.clients[clientid] = {
                    client: client
                }
                self.connections += 1;
                socket.emit("connected");
            }

            function listen(client) {
                //wire up client/soc events
                client.addListener('raw', function(message) {
                    socket.emit("raw", {
                        raw: message
                    });
                });

                socket.on("send", function(data) {
                    client.send(data, true);
                });

                socket.on("quit", function() {
                    client.quit();
                });

                socket.on("disconnect", function() {
                    self.clients[clientid].timer = setTimeout(function() {
                        client.quit();
                        delete self.clients[clientid];
                        self.connections -= 1;
                    }, 30 * 1000);//wait 30 secs to kill the connection
                });
            }

            socket.once('irc', connect);
            socket.on("reconnect", function(opts) {
                console.log("retrying");
                socket.emit("echo", "retrying");

                if(_.has(self.clients, opts.clientID)) {
                    var client = self.clients[opts.clientID];
                    clearTimeout(client.timer);
                    listen(client.client);
                } else { //create a new connection
                    connect(opts);
                }
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
        self.server = http.createServer(self.app);
        // compress content
        self.app.use(express.compress());
        self.app.use(express.static(options.ROOT + '/static', { maxAge: 1 }));
    };


    // self.setupTerminationHandlers();
    self.initializeServer();
};

exports = module.exports = Qwebirc;