/* global angular */

(function(){
    'use strict';

	angular.module('polpo.authorization').config(authConfig);
	
	authConfig.$inject = ['$provide', 'AuthServiceProvider'];
    function authConfig($provide, AuthServiceProvider) {
		
		$provide.decorator('Person', personDecorator);
		
		personDecorator.$inject = ['$delegate', '$rootScope', '$q', 'AuthService', 'LoopBackAuth', '$location'];
		function personDecorator($delegate, $rootScope, $q, AuthService, LoopBackAuth, $location)
		{
			$delegate.getCurrentUser = function(refresh, cb) {
				var currentUser = $delegate.getCachedCurrent();
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
				});
				return promise;
			};

			if(!$delegate.isAuthenticated()){
				var params = $location.search();

				// Handle response by adding properties to the LBAuth and then calling save
				LoopBackAuth.currentUserId = params.user_id;
				LoopBackAuth.accessTokenId = params.access_token;
				// Note that you can also set LoopBackAuth.rememberMe which changes the storage from session to local.

				// Saves the values to local storage.
				LoopBackAuth.save();
			}
			
			return $delegate;
		}

		AuthServiceProvider.settings({});
		
	}

})();