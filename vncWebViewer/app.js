var express = require('express')
    , app = express()
    , server = require('http').createServer(app)
    , io = require('socket.io').listen(server);
var VNCClient = require('./vnc-client');

app.use(express.static(__dirname + '/public'));
server.listen(process.env.PORT || 3000);

app.get('/', function (req, res) {
    res.sendfile(__dirname + '/index.html');
});

// Heroku doesn't support websockets yet.
io.configure(function () {
    io.set("transports", ["xhr-polling"]);
    io.set("polling duration", 5);
    io.set("log", 0);
});

var xOffset = 0, yOffset = 0;
var TILE_SIZE = 128;
io.sockets.on('connection', function (socket) {
    var vnc = new VNCClient('localhost');

    vnc.on('init', function (iniData) {
        socket.emit('init', iniData);
        var w = iniData.width, h = iniData.height;

        var canRequest = true;
        vnc.on('drain', function () {
            canRequest = true;
        });

        vnc.on('rect', function (rectData) {
            socket.emit('rect', rectData);
            delete rectData.pixels;
            console.log('rect: %j', rectData);
        });

        setInterval(function () {
            if (canRequest) {
                canRequest = vnc.requestUpdate(xOffset, yOffset,
                    Math.min(w - xOffset, TILE_SIZE), Math.min(h - yOffset, TILE_SIZE));

                xOffset += TILE_SIZE;
                if (xOffset >= w) {
                    xOffset = 0;
                    yOffset += TILE_SIZE;
                    if (yOffset >= h) {
                        yOffset = 0;
                    }
                }
            }
        }, 10);
    });
});






