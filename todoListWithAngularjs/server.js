var express = require('express'),
	app = express(),
  	server = require('http').createServer(app),
  	io = require('socket.io').listen(server);

app.use(express.static(__dirname + '/app'));

var users = { aaron: { username:'aaron' } };
var todoId = 0;
var todos = { 0: { content: 'test to do', deleted: false } };

io.sockets.on('connection', function (socket) {
  socket.on('req:login', function (username) {
  	socket.set('username', username, function () {
  		var user = {
  			username: username
  		};
  		
  		if (users[username]) {
  			delete users[username];
  		}

  		socket.emit('res:login', { ok: true, users: users, todos: todos });
  		socket.broadcast.emit('event:user', { login: true, user: user });

  		socket.on('disconnect', function () {
  			socket.broadcast.emit('event:user', { login: false, user: user });
  		});

  		socket.on('req:addTodo', function (todo) {
  			todoId++;
  			todo.id = todoId;
  			todos[todoId] = todo;

  			io.sockets.emit('event:todo', { action: 'add', todo: todo, user: username });
  		});

  		users[username] = user;
  	});
  });
});

server.listen(3000);