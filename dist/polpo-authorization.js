/* global angular */

(function () {
	'use strict';
	
	angular.module('polpo.authorization', []);
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
	 *		AuthService.setUser(user);
	 *	 and after logout:
	 *		AuthService.setUser(null);
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
	
	angular.module('polpo.authorization').factory('AuthService', AuthService);
	
	AuthService.$inject = ['$state'];
	function AuthService($state)
	{
		var currentUser = null;
		
		return {
			authorize: authorize,
			hasAccess: hasAccess,
			setUser: setUser,
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
				roles = {
					superuser	: ['superuser', 'editoradmin', 'editor', 'author'],
					editoradmin	: ['editoradmin', 'editor', 'author'],
					editor		: ['editor', 'author'],
					schooladmin	: ['schooladmin', 'teacher']
				};
			
			var userRoles = [],
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
				if (currentUser === null || currentUser.id === undefined) {
					return status.authorized;
				}
				return status.unauthorized;
			}
			
			// past this point, the user must be logged in
			if (currentUser === null || currentUser.id === undefined) {
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
			if (currentUser.roles === undefined || currentUser.roles.length === 0) {
				return status.unauthorized;
			}
			
			// map backend roles to local permissions
			for(i = 0, len = currentUser.roles.length; i < len ; i++) {
				permission = currentUser.roles[i];
				permission = permission.name;
				if (roles[permission] === undefined) {
					// if a role was passed that's not mapped, add it to the list of required roles
					// this way we don't have to specify roles that match exactly with our backend
					//continue;	// (uncomment this line if we don't want this behaviour)
					roles[permission] = [permission];
				}
				userRoles = userRoles.concat(roles[permission]);
			}

			if (permissionCheckType === match.all) {
				for(i = 0, len = requiredPermissions.length; i < len ; i++) {
					permission = requiredPermissions[i];
					// if a required permission is not in our list of user roles, i'm unauthorised
					if (userRoles.indexOf(permission) === -1) {
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
					if (userRoles.indexOf(permission) > -1) {
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
		 */
		function setUser(user)
		{
			currentUser = user;
		}
		
		/*
		 * watch for changes in user roles
		 */
		function getUserRoles()
		{
			return currentUser ? currentUser.roles : null;
		}
	}
})();