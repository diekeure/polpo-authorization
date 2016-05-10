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
		            	LoopBackAuth.save();
		          	}
		        });
				return promise;
			};

			function getQueryVariable(variable) {
				var query = window.location.search.substring(1);
				var vars = query.split('&');
				for (var i = 0; i < vars.length; i++) {
					var pair = vars[i].split('=');
					if (decodeURIComponent(pair[0]) === variable) {
						return decodeURIComponent(pair[1]);
					}
				}
			}

			if(!$delegate.isAuthenticated()){
				var params = $location.search();

				// Handle response by adding properties to the LBAuth and then calling save
				LoopBackAuth.currentUserId = params.userId || getQueryVariable('userId');
				LoopBackAuth.accessTokenId = params.accessToken || getQueryVariable('accessToken');

				// Note that you can also set LoopBackAuth.rememberMe which changes the storage from session to local.

				// Saves the values to local storage.
				LoopBackAuth.save();
			}

			if(getQueryVariable('accessToken') !== undefined){
				var newUrl = window.location.href.replace('userId='+LoopBackAuth.currentUserId, '').replace('accessToken='+LoopBackAuth.accessTokenId, '');
				newUrl = newUrl.replace(new RegExp(/\?\&/, 'g'), '?');
				newUrl = newUrl.replace(new RegExp(/\?\#/, 'g'), '#');
				newUrl = newUrl.replace(new RegExp(/\#\?/, 'g'), '#');
				window.location.replace(newUrl);
			}
			
			return $delegate;
		}

		AuthServiceProvider.settings({});
		
	}

})();