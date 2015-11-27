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
				ignore: null,
				onLogin: null,
				onDenied: null,
				resolve: null,
				rolesMap: null,
				userId: 'id',
				userRoles: 'roles'
			},
			resolveState = true;

		// add settings to prototype
		this.settings = function(opts) {
			if (opts !== undefined) {
				console.log('options');
				angular.extend(options, opts);
				// if our user is a promise, make sure it's resolved
				if (options.resolve) {
					resolveState = false;
				}
			}
			return options;
		};

		// When we request a service in our app config, the $injector is responsible for finding the correct service provider,
		// instantiating it and then calling its $get service function to get the instance of the service.
		// https://docs.angularjs.org/api/auto/service/$provide
		this.$get = ['$state', '$rootScope', '$injector', function($state, $rootScope, $injector) {
			// check access when page is opened
			$rootScope.$on('$stateChangeStart', changeStart);
			function changeStart(event, toState, toParams) {	//, fromState, fromParams
				// if pre-checks return true, we're authorized
				if (options.ignore && options.ignore(toState.name)) {
					return;
				}
				
				// is my user a promise that's not yet resolved?
				if (user() === false) {
					$injector.invoke(options.resolve).then(function(usr) {
						user(usr);	// update cached user
						$rootScope.$state.go(toState.name, toParams);	//, {reload: true}
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
			
			// public functions
			return {
				authorize: authorize,
				//hasAccess: hasAccess,
				user: user,
				getUserRoles: getUserRoles
			};
			
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

				// if owner was passed, it must mean he has access
				if (ownerId !== undefined && ownerId.toString() === currentUser.id.toString()) {
					return status.authorized;
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
				for(i = 0, len = userRoles.length; i < len ; i++) {
					permission = userRoles[i].name;
					if (roles[permission] === undefined) {
						// if a role was passed that's not mapped, add it to the list of required roles
						// this way we don't have to specify roles that match exactly with our backend
						//continue;	// (uncomment this line if we don't want this behaviour)
						roles[permission] = [permission];
					}
					mappedRoles = mappedRoles.concat(roles[permission]);
				}

				if (permissionCheckType === match.all) {
					for(i = 0, len = requiredPermissions.length; i < len ; i++) {
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
					for(i = 0, len = requiredPermissions.length; i < len ; i++) {
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
						for (i = 0, len = parentAccess.permissions.length; i < len; i++) {
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
		}];
	}
})();