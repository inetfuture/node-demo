var express = require('express')
  , app = express() 
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server);

app.use(express.static(__dirname + '/public'));
server.listen(process.env.PORT || 3000);

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

io.configure(function () { 
  io.set("transports", ["xhr-polling"]); 
  io.set("polling duration", 10); 
});

io.sockets.on('connection', function (socket) {  
  socket.emit('enter', { id: socket.id });

  socket.on('setNickname', function (name) {
    socket.set('nickname', name, function () {      
      socket.emit('ready');
      io.sockets.emit('enter', { nickname: name });

	  socket.on('disconnect', function () {
		io.sockets.emit('leave', { nickname: name });		
	  });

	  socket.on('say', function (data) {
		io.sockets.emit('say', { nickname: name, content: data });
	  });
    });
  });  
});
