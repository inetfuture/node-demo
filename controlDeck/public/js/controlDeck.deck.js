$('body').append('<script src="//controlDeck.herokuapp.com/socket.io/socket.io.js"></script>');

setTimeout(function () {
    var socket = io.connect('http://controlDeck.herokuapp.com:80');
    socket.emit('register', { role: 'deck' });
    socket.on('ready', function (deckId) {
        console.log('deckId: %d', deckId);

        socket.on('control', function (data) {
            $.deck(data.action);
        });

        socket.on('notification', function (data) {
            console.log('notification: %s', data);
        });
    });
}, 5000);

