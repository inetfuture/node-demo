function LoginCtrl($scope, $cookies, $location) {
	$scope.login = function() {
		$cookies.username = $scope.username;
		$location.path('/list');
	};
}

function ListCtrl($scope, $cookies, socket, $location) {
	var username = $cookies.username;
	$scope.username = username;
	
	$scope.users = {};
	$scope.todos = {};
	$scope.activities = [];

	$scope.addTodo = function () {
		socket.emit('req:addTodo', { content: $scope.newTodo_content });
		$scope.newTodo_content = '';
	};

	socket.emit('req:login', username);
	socket.on('res:login', function (res) {
		console.log('login result:', res);

		if (res.ok) {
			$scope.users = res.users;
			$scope.todos = res.todos;
		} else {
			$location.path('/login');
		}

		socket.on('event:user', function (data) {
			console.log('user event:', data);

			if (data.login) {			
				users[data.user.username] = data.user;
			} else {
				delete users[data.user.username];
			}

			$scope.activities.push('[user]' + data.user.username + data.login ? ' login' : 'logout');
		});

		socket.on('event:todo', function (data) {
			console.log('todo event:', data);

			if (data.action == 'add') {
				$scope.todos[data.todo.id] = data.todo;
			}

			$scope.activities.push('[todo]' + data.user + ' ' + data.action + ' ' + data.todo.content);
		});
	});
}