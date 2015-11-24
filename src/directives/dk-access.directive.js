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