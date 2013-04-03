var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var VNCClient = require('./vncClient');

app.use(express.static(__dirname + '/public'));
server.listen(3000);

app.get('/', function (req, res) {
    res.sendfile(__dirname + '/index.html');
});

io.configure(function () {
    io.set("log", 0);
});

var TILE_SIZE = 128;
var VNC_HOST = '192.168.196.95';

io.sockets.on('connection', function (webSocket) {
    var vncClient = new VNCClient(VNC_HOST);

    vncClient.on('init', function (initData) {
        console.log('[VNCClient init] %j', initData);

        webSocket.emit('init', initData);

        vncClient.on('rect', function (rectData) {
            webSocket.emit('rect', rectData);

            delete rectData.pixels;
            console.log('[VNCClient rect] %j', rectData);
        });

        var canRequest = true;
        vncClient.on('drain', function () {
            canRequest = true;
        });

        setInterval(function () {
            if (canRequest) {
                canRequest = vncClient.requestUpdate(0, 0, initData.width, initData.height);
            }
        }, 10);
    });

    vncClient.on('error', function (err) {
        console.error('[VNCClient error] %j', err);
    });

    vncClient.on('close', function () {
        console.warn('[VNCClient close]');

        webSocket.disconnect();
    });

    webSocket.on('disconnect', function () {
        vncClient.end();
    });
});

process.on('uncaughtException', function (err) {
    console.error('[process uncaughtException] %j', err);
});






