/* global angular */

(function(){
    'use strict';

	angular.module('polpo.authorization').config(authConfig);

  authConfig.$inject = ['$provide', 'AuthServiceProvider', '$qProvider'];
    function authConfig($provide, AuthServiceProvider, $qProvider) {

    // silence chrome unhandled rejection error
    $qProvider.errorOnUnhandledRejections(false);
		$provide.decorator('Person', personDecorator);

		personDecorator.$inject = ['$delegate', '$rootScope', '$q', 'AuthService', 'LoopBackAuth'];
		function personDecorator($delegate, $rootScope, $q, AuthService, LoopBackAuth)
		{
			$delegate.getCurrentUser = function(refresh, cb) {
				var currentUser = AuthService.user();
				// allow callback function without refresh parameter
				if (angular.isFunction(refresh)) {
					cb = refresh;
					refresh = false;
				}
				
				if (!refresh && currentUser) {
					if (cb) {
						return cb(currentUser);
					}
					// always return promise, so we don't have to check
					return $q.when(currentUser);
				}
				
				// update from backend, returns promise
				var promise = $delegate.getCurrent().$promise;
				promise.then(function(user) {
					AuthService.user(user);
					// send global event that user is updated
					// catch with `$rootScope.$on('user.update', function(e, user) {});´ where needed (f.i. HeaderController)
					$rootScope.$emit('user.update', user);

					if (cb) {
						return cb(user);
					}
				}).catch(function(err){
		         	if(err.status === 401){
		            	LoopBackAuth.currentUserId = null;
		            	LoopBackAuth.accessTokenId = null;
		            	LoopBackAuth.rememberMe = 1;
		            	LoopBackAuth.save();
		            	LoopBackAuth.rememberMe = 0;
		            	LoopBackAuth.save();
		          	}
		        });
				return promise;
			};

			function getQueryVariable(variable) {
				var query = window.location.search.substring(1);
				if(query === ''){
					if(window.location.hash.indexOf('?') > -1){
						//parameters are passed after hash
						query = window.location.hash.split('?')[1];
					}
				}
				var vars = query.split('&');
				for (var i = 0; i < vars.length; i++) {
					var pair = vars[i].split('=');
					if (decodeURIComponent(pair[0]) === variable) {
						return decodeURIComponent(pair[1]);
					}
				}
			}

			if(!$delegate.isAuthenticated() || getQueryVariable('accessToken') !== undefined){
				LoopBackAuth.currentUserId = getQueryVariable('userId');
				LoopBackAuth.accessTokenId = getQueryVariable('accessToken');
				LoopBackAuth.save();
			}
			
			return $delegate;
		}

		AuthServiceProvider.settings({});
		
	}

})();