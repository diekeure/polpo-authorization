/* global angular */

(function () {
	'use strict';
	
	angular.module('polpo.authorization', ['ui.router', 'lbServices', 'ngCookies']);
})();
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
				var vars = query.split('&');
				for (var i = 0; i < vars.length; i++) {
					var pair = vars[i].split('=');
					if (decodeURIComponent(pair[0]) === variable) {
						return decodeURIComponent(pair[1]);
					}
				}
			}

			if(!$delegate.isAuthenticated() || getQueryVariable('accessToken') !== undefined){
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
				newUrl = newUrl.replace(/\?\&/g, '?');
				newUrl = newUrl.replace(/\?\#/g, '#');
				newUrl = newUrl.replace(/\#\?/g, '#');
				window.location.replace(newUrl);
			}
			
			return $delegate;
		}

		AuthServiceProvider.settings({});
		
	}

})();
(function () {
	'use strict';
	
	/*
	 * dk-access:
	 *	- '*'		: allows everyone, including not logged in
	 *	- '!'		: allow unauthenticated only
	 *	- <empty>	: allow only logged in users
	 *	- 'a,b,...'	: allow of specified groups (comma seperated)
	 *	
	 * dk-access-type (optional, default = false):
	 *	- all		: must be a member of all specified groups
	 *	- one		: must be a member of at least one group
	 * 
	 * dk-access-owner (optional):
	 *	- <ID>		: only allow if the logged in user ID === dk-access-owner
	 */
	angular.module('polpo.authorization').directive('dkAccess', dkAccess);
	
	dkAccess.$inject = ['AuthService', '$animate'];
	function dkAccess(AuthService, $animate)
	{
		return {
			transclude: 'element',
			priority: 600,
			restrict: 'A',
			scope: {
				roles: '@dkAccess',
				type: '@dkAccessType',
				owner: '@dkAccessOwner'
			},
			link: function($scope, $element, $attr, ctrl, $transclude) {
				var block, childScope, previousElements;
				
				var roles = $scope.roles,
					type = $scope.type,
					owner = $scope.owner;
				
				switch(roles) {
					case '*': roles = undefined;	// access for everyone, including unauthenticated users
						break;
					case '!':						// show to unauthenticated users, hide for authenticated users
						break;
					case '': roles = [];			// access for all logged in users
						break;
					default: roles = roles.split(',');
						break;
				}
				
				$scope.$watch(function() {
					return AuthService.getUserRoles();
				}, function() {	//newValue, oldValue
					checkAccess();
				});
				
				function checkAccess()
				{
					// filter out invalid (non-boolean) responses for our AuthService, like 'login'
					var value = AuthService.authorize(roles, type, owner) === true ? true : false;
					
					if (value) {
						if (!childScope) {
							$transclude(function(clone, newScope) {
								childScope = newScope;
								clone[clone.length++] = document.createComment(' end dkAccess: ' + $scope.roles + ' ');
								// Note: We only need the first/last node of the cloned nodes.
								// However, we need to keep the reference to the jqlite wrapper as it might be changed later
								// by a directive with templateUrl when its template arrives.
								block = {
									clone: clone
								};
								$animate.enter(clone, $element.parent(), $element);
							});
						}
					}
					else {
						if (previousElements) {
							previousElements.remove();
							previousElements = null;
						}
						if (childScope) {
							childScope.$destroy();
							childScope = null;
						}
						if (block) {
							previousElements = getBlockNodes(block.clone);
							$animate.leave(previousElements).then(function() {
								previousElements = null;
							});
							block = null;
						}
					}
					
				}
				
				/**
				 * Return the DOM siblings between the first and last node in the given array.
				 * @param nodes {Array} array like object
				 * @returns {jqLite} jqLite collection containing the nodes
				 */
				function getBlockNodes(nodes)
				{
					// TODO(perf): just check if all items in `nodes` are siblings and if they are return the original
					//             collection, otherwise update the original collection.
					var node = nodes[0];
					var endNode = nodes[nodes.length - 1];
					var blockNodes = [node];

					do {
						node = node.nextSibling;
						if (!node) {
							break;
						}
						blockNodes.push(node);
					} while (node !== endNode);

					return angular.element(blockNodes);	// angular.element() wraps it in jqLite
				}

			}
		};
	}
		
	/*
	 * Failed to make this work properly when nesting dkAccess directives,
	 * so copied and adapted ngIf from angular.js
	 * /
	// we want to extend from ngIf directive, so we can remove the element if access is not granted
	// followed this suggestion: http://stackoverflow.com/a/29010910
	function dkAccess(ngIfDirective, AuthService, $animate, $rootScope) {
		var ngIf = ngIfDirective[0];
		
		return {
			multiElement: ngIf.multiElement,
			transclude: ngIf.transclude,
			priority: ngIf.priority - 1,
			terminal: ngIf.terminal,
			restrict: ngIf.restrict,
			$$tlb : ngIf.$$tlb,
			
			linkNgIf: function($scope, $element, $attr) {
				var roles = $attr.dkAccess,
					type = $attr.dkAccessType,
					owner = $attr.dkAccessOwner;
				
				switch(roles) {
					case '*': roles = undefined;	// access for everyone, including unauthenticated users
						break;
					case '!':						// show to unauthenticated users, hide for authenticated users
						break;
					case '': roles = [];			// access for all logged in users
						break;
					default: roles = roles.split(',');
						break;
				}
				
				var ngIfAttr = $attr.ngIf !== undefined ? $attr.ngIf : function() { return true; };
				
				var accessFunc = function() {
						// resolve access check; anything apart from true (f.i. 'login') means we have no access
						var dkAccessResult = AuthService.authorize(roles, type, owner) === true ? true : false,
						// if there already is an ng-if attribute, evaluate it too
							ngIfResult = $scope.$eval(ngIfAttr);
						
						return ngIfResult && dkAccessResult;
					};
					
				$attr.ngIf = accessFunc;
				ngIf.link.apply(ngIf, arguments);
			}
			
		};
	}
	/**/

})();
(function () {
	'use strict';

	/*
	 * AuthService
	 * 
	 * - Remember to update currentUser after logging in with:
	 *		AuthService.user(usr);
	 *	 and after logout:
	 *		AuthService.user(null);
	 * 
	 * - Use in $routeProvider
	 *	 f.i.:
	 *		$stateProvider.state('routename', {
	 *			url: '/path',
	 *			access: {
	 *				permissions: ['role'],	-> can be:
	 *											- undefined					: everyone,
	 *											- [] (empty array)			: all authenticated users
	 *											- ['roleA', 'roleB', ...]	: members with roleA, roleB, ...
	 *											- '!'						: only for guests
	 *				type: true|false		-> true: match all roles, false: match single role (optional; default: false)
	 *				inherit: true|false		-> merge with restrictions from parent routes (optional, default true)
	 *			}
	 *		};
	 *	 Beware: when using inherit and parents have a different 'type', we may get unpredictable results!
	 *  
	 * - Use with directive dkAccess
	 *	 f.i.: <div dk-access='role1,role2,...' dk-access-type='one|all' dk-access-owner='owner.id'></div>
	 *		-> dk-access can be:
	 *			- a comma seperated list with role names
	 *			- blank	: only authenticated users
	 *			- '*'	: everyone
	 *			- '!'	: only unauthenticated users
	 *		-> dk-access-type is optional, defaults to 'one'
	 *		-> dk-access-owner is optional, when passed and matches the user id, allow access
	 */
	
	// Since we would like the settings to be configurable in the app, we must use a provider. Only that allows us to set our own $get function.
	// https://docs.angularjs.org/guide/providers#provider-recipe
	angular.module('polpo.authorization').provider('AuthService', AuthService);
	
	function AuthService()
	{
		var currentUser = null,
			options = {
				allowedRoles: [],
				allowedTypes: [],
				ignore: true,
				onLogin: null,
				onDenied: null,
				resolve: function(Person) {
					return Person.getCurrentUser();
				},
				rolesMap: null,
				userId: 'id',
				userRoles: 'roles',
				userType: 'type',
				logout: function(Person) {
					return Person.logout();
				}
			},
			resolveState = true,
			rolesCheck = true,
			typeCheck = true;
		// minification safe DI
		options.resolve.$inject = ['Person'];
		options.logout.$inject = ['Person'];

		// add settings to prototype
		this.settings = function(opts) {
			if (opts !== undefined) {
				angular.extend(options, opts);
				// if our user is a promise, make sure it's resolved
				if (options.resolve) {
					resolveState = false;
				}
				
				if (angular.isString(options.allowedRoles)) {
					options.allowedRoles = [options.allowedRoles];
				}
				rolesCheck = (options.allowedRoles.length === 0); // if there are no allowedRoles specified, rolesCheck can be skipped
				
				if (angular.isString(options.allowedTypes)) {
					options.allowedTypes = [options.allowedTypes];
				}
				typeCheck = (options.allowedTypes.length === 0); // if there are no allowedTypes specified, typeCheck can be skipped
			}
			return options;
		};

		// When we request a service in our app config, the $injector is responsible for finding the correct service provider,
		// instantiating it and then calling its $get service function to get the instance of the service.
		// https://docs.angularjs.org/api/auto/service/$provide
		this.$get = initService;
		
		initService.$inject = ['$state', '$rootScope', '$injector', '$cookies'];
		function initService($state, $rootScope, $injector, $cookies)
		{
			if (options.ignore !== true) {
				// check access when page is opened
				$rootScope.$on('$stateChangeStart', changeStart);
			}
			
			/*
			 * public properties
			 */
			return {
				authorize: authorize,
				//hasAccess: hasAccess,
				user: user,
				getUserRoles: getUserRoles,
				userPromise: userPromise,
				logout: logout
			};
			
			/*
			 * private functions
			 */
			function changeStart(event, toState, toParams)	//, fromState, fromParams
			{
				// if pre-checks return true, we're authorized
				if (options.ignore && options.ignore(toState.name)) {
					return;
				}
				
				// is my user a promise that's not yet resolved?
				if (user() === false) {
					$injector.invoke(options.resolve).then(function(usr) {
						user(usr);	// update cached user
						$rootScope.$state.go(toState.name, toParams, {reload: true});
					}, function () {
						return options.onLogin ? $injector.invoke(options.onLogin) : false;
					});

					return event.preventDefault();	// stop loading view
				}

				return checkAccess();

				function checkAccess()
				{
					var authorized = hasAccess(toState);
					
					if (authorized !== true) {
						if (authorized === false) {
							if (options.onDenied) {
								$injector.invoke(options.onDenied);
							}
						}
						else if (authorized === 'login') {
							if (options.onLogin) {
								$injector.invoke(options.onLogin);
							}
						}
						return event.preventDefault();
					}
				}
			}
			
			/*
			 * Check access permissions by role
			 * 
			 * @param {array|string} [requiredPermissions] - List of roles to check, '!' = only for unauthenticated users, undefined
			 * @param {boolean} [permissionCheckType=match.one] - Check for single role (match.one) or for all roles (match.all)
			 * @returns {(boolean|string)} status - Returns boolean indicating access or if redirect to loginpage is forced
			 */
			function authorize(requiredPermissions, permissionCheckType, ownerId)
			{
				// possible return statuses
				var status = {
						authorized: true,
						unauthorized: false,
						loginRequired: 'login'
					},
				// match roles
					match = {
						one: false,	// at least one
						all: true	// all
					},
				// map api-roles to angular access-directives
				// identical permission/role names are automatically mapped
				// always add backend roles case sensitive and as array (even when there's only one)
					roles = angular.merge({
						superuser	: ['superuser', 'editoradmin', 'editor', 'author'],
						editoradmin	: ['editoradmin', 'editor', 'author'],
						editor		: ['editor', 'author'],
						schooladmin	: ['schooladmin', 'teacher']
					}, options.rolesMap || {});
				
				angular.forEach(roles, function(value, key) {
					if (angular.isString(value)) {
						roles[key] = [value];
					}
				});

				var mappedRoles = [],
					userRoles = getUserRoles(),
					i, permission, len;

				// our directive passes strings
				if (angular.isString(permissionCheckType)) {
					permissionCheckType = match[permissionCheckType];
				}
				permissionCheckType = permissionCheckType || match.one;

				// without permissions, everyone has access
				if (requiredPermissions === undefined) {
					return status.authorized;
				}

				if (requiredPermissions === '!') {
					if (currentUser === null) {
						return status.authorized;
					}
					return status.unauthorized;
				}

				// past this point, the user must be logged in
				if (currentUser === null) {
					return status.loginRequired;
				}
				
				// check allowed type and/or roles
				if (typeCheck === false || rolesCheck === false) {
					return status.loginRequired;
				}

				// if owner was passed, it must mean he has access
				if (ownerId !== undefined && ownerId.toString() === currentUser.id.toString()) {
					return status.authorized;
				}

				if (!angular.isArray(requiredPermissions)) {
					requiredPermissions = requiredPermissions.split(',');
				}
				// if required permissions is an empty array, every logged in user has access
				if (requiredPermissions.length === 0) {
					return status.authorized;
				}

				// past this point, the user must have roles
				if (userRoles === null || userRoles.length === 0) {
					return status.unauthorized;
				}

				// map backend roles to local permissions
				len = userRoles.length;
				for(i = 0; i < len; i++) {
					permission = userRoles[i].name;
					if (roles[permission] === undefined) {
						// if a role was passed that's not mapped, add it to the list of required roles
						// this way we don't have to specify roles that match exactly with our backend
						//continue;	// (uncomment this line if we don't want this behaviour)
						roles[permission] = [permission];
					}
					mappedRoles = mappedRoles.concat(roles[permission]);
				}

				len = requiredPermissions.length;
				if (permissionCheckType === match.all) {
					for(i = 0; i < len; i++) {
						permission = requiredPermissions[i];
						// if a required permission is not in our list of user roles, i'm unauthorised
						if (mappedRoles.indexOf(permission) === -1) {
							return status.unauthorized;
						}
					}
					// hurray, every role is granted access
					return status.authorized;
				}
				if (permissionCheckType === match.one) {
					for(i = 0; i < len; i++) {
						permission = requiredPermissions[i];
						// as soon as one role is matched, we're good
						if (mappedRoles.indexOf(permission) > -1) {
							return status.authorized;
						}
					}
					// alas, not a single role granted access
					return status.unauthorized;
				}

				// if we make it here, we specified an unknown permissionCheckType --> access denied!
				return status.unauthorized;
			}

			/*
			 * Check permissions for specified route
			 * 
			 * @param {string} toState - route name
			 * @returns {object} mergedAccess - Returns merged access rules
			 */
			function hasAccess(toState)
			{
				var access = getAccess(toState.name, toState.dkAccess),
					authorized = authorize(access.permissions, access.type);

				return authorized;

				// Merge access rules from route and (optionally) parents
				function getAccess(routeName, mergedAccess) {
					var route = $state.get(routeName),
						parentAccess, parentName,
						i, len;

					mergedAccess = mergedAccess || {};
					if (route === null) {
						return mergedAccess;
					}

					// merge parent access settings with the ones from the child (angular.merge overwrites dkAccess array instead of concatenating)
					parentAccess = route.dkAccess || {};
					if (parentAccess.permissions !== undefined) {
						mergedAccess.permissions = mergedAccess.permissions || [];
						// add without duplicates
						len = parentAccess.permissions.length;
						for (i = 0; i < len; i++) {
							if (mergedAccess.permissions.indexOf(parentAccess.permissions[i]) === -1) {
								mergedAccess.permissions.push(parentAccess.permissions[i]);
							}
						}
					}
					if (parentAccess.type !== undefined) {
						mergedAccess.type = parentAccess.type;
					}
					// 'inherit' property does not serve a purpose in the returned object, so no need to update it
				//	if (parentAccess.inherit !== undefined) {
				//		mergedAccess.inherit = parentAccess.inherit;
				//	}

					// if we didn't cancel inheritance, merge with settings from parent
					if (parentAccess.inherit !== false) {
						// according to router-ui docs (https://github.com/angular-ui/ui-router/wiki/Nested-States-and-Nested-Views)
						// parent can be specified by: dot notation, parent <string> or parent <object>
						if (route.parent === undefined) {
							// dot notation
							parentName = routeName.split('.').slice(0, -1).join('.');	// slice last segment off current route name
						}
						else if (angular.isString(route.parent)) {
							// parent parameter is string
							parentName = route.parent;
						}
						else if (angular.isObject(route.parent)) {
							// parent parameter is object
							parentName = route.parent.name;
						}
						else {
							return mergedAccess;
						}
						return getAccess(parentName, mergedAccess);
					}
					return mergedAccess;
				}
			}

			/*
			 * cache user profile
			 * returns user data or false if it's a promise that's not yet resolved
			 */
			function user(usr)
			{
				if (usr !== undefined) {
					currentUser = usr;
					resolveState = true;	// assume that a user is only set after promise is resolved
					
					// reset checks
					rolesCheck = (options.allowedRoles.length === 0);
					typeCheck = (options.allowedTypes.length === 0);
					if (usr !== null) {		// just logged in or updated
						// only perform additional checks when the options are set
						if (rolesCheck === false) {
							// find allowed roles in users roles
							var allowedRoles = usr[options.userRoles].filter(function(role) {
								return (options.allowedRoles.indexOf(role.name) !== -1);
							});
							rolesCheck = (allowedRoles.length !== 0);
						}
						if (typeCheck === false) {
							typeCheck = (options.allowedTypes.indexOf(usr[options.userType]) !== -1);
						}
					}
				}
				return resolveState ? currentUser : false;
			}

			/*
			 * watch for changes in user roles
			 */
			function getUserRoles()
			{
				return currentUser ? currentUser[options.userRoles] : null;
			}
			
			function userPromise()
			{
				return $injector.invoke(options.resolve);
//						// actually not needed here, since we call it in the Person.getCurrentUser() whenever the user get loaded
//						// another disadvantage of calling this function here, is that even for a cached user, this would be re-run
//						.then(function(usr) {
//							return user(usr);	// update cached user (and return it so it can be chained to another 'then 'function)
//						});
			}

			function logout(){
				return $injector.invoke(options.logout).$promise.then(function(result){
		          $cookies.remove('access_token');
		          $cookies.remove('userId');
		          user(null);
		          return result;
		        });
			}
		}
	}
})();