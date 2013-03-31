var app = require('http').createServer(handler)
    , io = require('socket.io').listen(app)

app.listen(process.env.PORT || 3000);

// Heroku doesn't support websockets yet.
io.configure(function () { 
  io.set("transports", ["xhr-polling"]); 
  io.set("polling duration", 5);
});

var count = 0;
var deckControllerPairs = {};

io.sockets.on('connection', function (socket) {
  socket.on('register', function (data) {
    if (data.role === 'deck') {
      var deckId = count++;
      var pair = {
        deck: socket
      };
	  deckControllerPairs[deckId] = pair;

      socket.on('disconnect', function () {		
		if (pair.controller) {
          pair.controller.disconnect();
        }

        delete deckControllerPairs[deckId];
      });

      socket.emit('ready', deckId);
    } else if (data.role === 'controller') {
	  var pair = deckControllerPairs[data.deckId];   
      var failReason;   
      if (pair) {
        if (!pair.controller) {
          pair.controller = socket;

          socket.on('control', function (data) {
          	pair.deck.emit('control', data);
          }); 

          socket.on('disconnect', function () {
            delete pair.controller;
            pair.deck.emit('notification', 'Unbound a controller!');
          });          

          pair.deck.emit('notification', 'Bound a controller!');         
        } else {
          failReason = 'Controller already exists!';
        }	
      } else {
		failReason = 'Deck not found';
      }    

      socket.emit('ready', failReason);  
    }
  });
});

function handler(req, res) {
    res.end('Hello world!');
}
