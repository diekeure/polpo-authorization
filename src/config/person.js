/* global angular */

(function(){
    'use strict';

	angular.module('polpo.authorization').config(authConfig);
	/* @ngInject */
    function authConfig($provide, AuthServiceProvider) {
		
		// decorate Person
		/* @ngInject */
		$provide.decorator('Person', function($delegate, $rootScope, $q, AuthService) {
			
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
				var promise = $delegate.getCurrent({filter: {include: ['personPreferences', 'roles']}}).$promise;
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
			
			return $delegate;
		});


		AuthServiceProvider.settings({});
		
	}

})();