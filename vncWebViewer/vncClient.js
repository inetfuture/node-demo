var util = require('util');
var events = require('events');
var net = require('net');
var des = require('des');

module.exports = VNCClient;

// Constants.
var STATE_HANDSHAKE = 0,
    STATE_AUTH = 1,
    STATE_AUTH_VNC = 2,
    STATE_AUTH_RES = 3,
    STATE_INIT = 4,
    STATE_MSG = 5,
    STATE_RECTANGLES = 6;

var MSG_FRAMEBUFFER_UPDATE = 0,
    MSG_Server_CutText = 3;

var CMD_SET_ENCODINGS = 2,
    CMD_FRAMEBUFFER_UPDATE_REQUEST = 3;

var ENCODING_RAW = 0,
    ENCODING_COPY_RECT = 1;

function VNCClient(host, password) {
    this.password = password;
    this.socket = net.createConnection(5900, host);
    this.recvBuf = new Buffer(0);
    this.socket.on('connect', this.onConnect.bind(this));
    this.socket.on('data', this.onData.bind(this));
    this.socket.on('close', this.onClose.bind(this));
}
util.inherits(VNCClient, events.EventEmitter);

VNCClient.prototype.error = function (message) {
    if (this.socket.writable) {
        this.socket.end();
    }

    this.emit('error', new Error(message));
};

VNCClient.prototype.onConnect = function () {
    this.state = STATE_HANDSHAKE;

    var emit = this.emit.bind(this);
    var socket = this.socket;

    function proxyEvent(event) {
        socket.on(event, emit.bind(null, event));
    }

    proxyEvent('drain');
    proxyEvent('end');
    proxyEvent('close');
    proxyEvent('error');
};

VNCClient.prototype.onClose = function () {
    console.warn("RFB connection closed");
};

VNCClient.prototype.onData = function (data) {
    if (data) {
        var recvBuf = new Buffer(this.recvBuf.length + data.length);
        this.recvBuf.copy(recvBuf);
        data.copy(recvBuf, this.recvBuf.length);
        this.recvBuf = recvBuf;
    }

    //console.log("data", this.state, data, this.recvBuf);
    switch (this.state) {
        case STATE_HANDSHAKE:
            if (this.recvBuf.length >= 12) {
                var s = this.recvBuf.slice(0, 12).toString();
                this.recvBuf = this.recvBuf.slice(12);
                var m;
                if ((m = s.match(/^RFB (\d\d\d)\.(\d\d\d)/))) {
                    var maj = parseInt(m[1], 10);
                    var min = parseInt(m[2], 10);

                    console.log("Server speaks " + maj + "." + min);

                    if (maj >= 3 && min >= 3) {
                        this.version = [maj, min];
                        this.socket.write("RFB 003.003\n");
                        this.state = STATE_AUTH;
                    } else {
                        this.error("Protocol version " + maj + "." + min + " not implemented");
                    }
                } else {
                    this.error("Invalid protocol handshake");
                }
            }
            break;
        case STATE_AUTH:
            if (this.recvBuf.length >= 4) {
                var secType = this.recvBuf.slice(0, 4).readUInt32BE(0);
                this.recvBuf = this.recvBuf.slice(4);

                var noAuth = false, vncAuth = false;
                switch (secType) {
                    case 1:
                        noAuth = true;
                        break;
                    case 2:
                        vncAuth = true;
                        break;
                }
                if (noAuth) {
                    this.initClient();
                } else if (vncAuth) {
                    if (typeof this.password === 'string') {
                        this.socket.write(new Buffer([2]));
                        this.state = STATE_AUTH_VNC;
                    } else {
                        this.error("Password required");
                    }
                } else {
                    this.error("VNC authentication not offered");
                }
            }
            break;
        case STATE_AUTH_VNC:
            if (this.recvBuf.length >= 16) {
                var challenge = this.recvBuf.slice(0, 16);
                this.recvBuf = this.recvBuf.slice(16);

                var response = des.encrypt(this.password, challenge);
                this.socket.write(response);
                this.state = STATE_AUTH_RES;
            }
            break;
        case STATE_AUTH_RES:
            if (this.recvBuf.length >= 4) {
                var ok = this.recvBuf[3] === 0;
                this.recvBuf = this.recvBuf.slice(4);
                if (ok) {
                    this.initClient();
                } else {
                    this.error("Authentication failure");
                }
            }
            break;
        case STATE_INIT:
            if (this.recvBuf.length >= 24) {
                var nameLen = this.recvBuf.readUInt32BE(20);
                if (this.recvBuf.length >= 24 + nameLen) {
                    this.width = this.recvBuf.readUInt16BE(0);
                    this.height = this.recvBuf.readUInt16BE(2);
                    this.name = this.recvBuf.slice(24, 24 + nameLen).toString();
                    this.pixelFormat = parsePixelFormat(this.recvBuf.slice(4, 20));

                    this.recvBuf = this.recvBuf.slice(24 + nameLen);
                    this.state = STATE_MSG;
                    this.emit('init', {
                        width: this.width,
                        height: this.height,
                        name: this.name,
                        pixelFormat: this.pixelFormat
                    });

                    this.setEncodings();
                }
            }
            break;
        case STATE_MSG:
            if (this.recvBuf.length >= 1) {
                switch (this.recvBuf[0]) {
                    case MSG_FRAMEBUFFER_UPDATE:
                        if (this.recvBuf.length >= 4) {
                            this.rectangles = this.recvBuf.readUInt16BE(2);
                            this.recvBuf = this.recvBuf.slice(4);

                            this.state = STATE_RECTANGLES;
                            this.onData();
                        }
                        break;
                    case MSG_Server_CutText:
                        var txtLen = this.recvBuf.readUInt32BE(4);
                        if (this.recvBuf.length >= 8 + txtLen) {
                            var txt = this.recvBuf.slice(8, 8 + txtLen);
                            this.recvBuf = this.recvBuf.slice(8 + txtLen);
                        }
                        break;
                    default:
                        this.error("Unknown message type");
                }
            }
            break;
        case STATE_RECTANGLES:
            if (this.recvBuf.length >= 12) {
                var x = this.recvBuf.readUInt16BE(0);
                var y = this.recvBuf.readUInt16BE(2);
                var w = this.recvBuf.readUInt16BE(4);
                var h = this.recvBuf.readUInt16BE(6);
                var encoding = this.recvBuf.readInt32BE(8);
                var pixelsLen = Math.ceil(w * h * this.pixelFormat.bpp / 8);
                if (this.recvBuf.length >= 12 + pixelsLen) {
                    var pixels = this.recvBuf.slice(12, 12 + pixelsLen);
                    this.recvBuf = this.recvBuf.slice(12 + pixelsLen);

                    this.onRectangle(x, y, w, h, encoding, pixels);

                    /* One frame received */
                    this.rectangles--;
                    if (this.rectangles < 1) {
                        this.state = STATE_MSG;
                        this.onData();
                    }
                }
            }
            break;
        default:
            console.log("Received in state", this.state, this.recvBuf);
    }
};

VNCClient.prototype.onRectangle = function (x, y, w, h, encoding, data) {
    if (encoding !== ENCODING_RAW) {
        this.error("Received something else than RAW encoding");
        return;
    }

    var readFun;
    switch (this.pixelFormat.bpp) {
        case 8:
            readFun = 'readInt8';
            break;
        case 16:
            readFun = this.pixelFormat.bigEndian ?
                'readUInt16BE' :
                'readUInt16LE';
            break;
        case 32:
            readFun = this.pixelFormat.bigEndian ?
                'readUInt32BE' :
                'readUInt32LE';
            break;
        default:
            this.error("Unsupported bpp " + this.pixelFormat.bpp);
            return;
    }
    var read = data[readFun].bind(data);
    var offsetDelta = Math.ceil(this.pixelFormat.bpp / 8);

    var x1, y1, offset = 0, pixels = [];
    for (y1 = y; y1 < y + h; y1++) {
        var line = [];
        for (x1 = x; x1 < x + w; x1++) {
            var pixel = read(offset);
            offset += offsetDelta;

            var rgb = [
                (pixel >> this.pixelFormat.rShift) & this.pixelFormat.rMax,
                (pixel >> this.pixelFormat.gShift) & this.pixelFormat.gMax,
                (pixel >> this.pixelFormat.bShift) & this.pixelFormat.bMax
            ];
            line.push(rgb);
        }
        pixels.push(line);
    }

    this.emit('rect', {
        x: x, y: y,
        w: w, h: h,
        pixels: pixels
    });
};

VNCClient.prototype.initClient = function () {
    // Share desktop among multiple clients
    this.socket.write(new Buffer([1]));
    this.state = STATE_INIT;
};

VNCClient.prototype.setEncodings = function () {
    // Tell the server we support both RAW and CopyRect encoding formats.
    var b = new Buffer(12);
    b[0] = CMD_SET_ENCODINGS;
    b[1] = 0;
    b.writeUInt16BE(2, 2);
    b.writeUInt32BE(ENCODING_COPY_RECT, 4);
    b.writeUInt32BE(ENCODING_RAW, 8);

    this.socket.write(b);
};

VNCClient.prototype.requestUpdate = function (x, y, w, h) {
    var b = new Buffer(10);
    b[0] = CMD_FRAMEBUFFER_UPDATE_REQUEST;
    // Use incremental update.
    b[1] = 1;
    b.writeUInt16BE(x, 2);
    b.writeUInt16BE(y, 4);
    b.writeUInt16BE(w, 6);
    b.writeUInt16BE(h, 8);
    return this.socket.write(b);
};

VNCClient.prototype.end = function () {
    if (this.socket.writable) {
        this.socket.end();
    }
};

function parsePixelFormat(buf) {
    return {
        bpp: buf.readUInt8(0),
        depth: buf.readUInt8(1),
        bigEndian: buf.readUInt8(2),
        trueColor: buf.readUInt8(3),
        rMax: buf.readUInt16BE(4),
        gMax: buf.readUInt16BE(6),
        bMax: buf.readUInt16BE(8),
        rShift: buf.readUInt8(10),
        gShift: buf.readUInt8(11),
        bShift: buf.readUInt8(12)
    };
}