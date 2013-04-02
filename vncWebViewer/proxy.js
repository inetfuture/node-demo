var net = require('net');

module.exports = Proxy;

function Proxy(options) {
    this.options = options;
}

Proxy.prototype.connect = function () {
    var socket = new net.connect({ port: this.options.port, host: this.options.host }, function () {
        socket.setEncoding('ascii');
        socket.on('data', function (data) {
            console.log(data);
            socket.write('RFB 003.003\n', 'binary');
        });
    });
};