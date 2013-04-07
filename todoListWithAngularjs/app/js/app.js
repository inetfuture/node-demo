angular.module('todoList', ['ngCookies', 'todoList.services']).
  config(['$routeProvider', function ($routeProvider) {
  	$routeProvider.
  	  when('/login', { templateUrl: 'partials/login.html', controller: LoginCtrl }).
  	  when('/list', { templateUrl: 'partials/list.html', controller: ListCtrl }).
  	  otherwise({ redirectTo: '/login' });
  }]).
  run(function($rootScope, $cookies, $location) {
    $rootScope.$on( "$routeChangeStart", function(event, next, current) {
      if (next.$route.templateUrl != "partials/login.html" && !$cookies.username) {        
        $location.path( "/login" );
      }         
    });
 	});