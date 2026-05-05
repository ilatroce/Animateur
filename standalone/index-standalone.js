(() => {
const {
	EventDispatcher,
	MOUSE,
	Quaternion,
	Spherical,
	TOUCH,
	Vector2,
	Vector3,
	Plane,
	Ray,
	MathUtils
} = THREE;

// OrbitControls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: two-finger move

const _changeEvent = { type: 'change' };
const _startEvent = { type: 'start' };
const _endEvent = { type: 'end' };
const _ray = new Ray();
const _plane = new Plane();
const TILT_LIMIT = Math.cos( 70 * MathUtils.DEG2RAD );

class OrbitControls extends EventDispatcher {

	constructor( object, domElement ) {

		super();

		this.object = object;
		this.domElement = domElement;
		this.domElement.style.touchAction = 'none'; // disable touch scroll

		// Set to false to disable this control
		this.enabled = true;

		// "target" sets the location of focus, where the object orbits around
		this.target = new Vector3();

		// Sets the 3D cursor (similar to Blender), from which the maxTargetRadius takes effect
		this.cursor = new Vector3();

		// How far you can dolly in and out ( PerspectiveCamera only )
		this.minDistance = 0;
		this.maxDistance = Infinity;

		// How far you can zoom in and out ( OrthographicCamera only )
		this.minZoom = 0;
		this.maxZoom = Infinity;

		// Limit camera target within a spherical area around the cursor
		this.minTargetRadius = 0;
		this.maxTargetRadius = Infinity;

		// How far you can orbit vertically, upper and lower limits.
		// Range is 0 to Math.PI radians.
		this.minPolarAngle = 0; // radians
		this.maxPolarAngle = Math.PI; // radians

		// How far you can orbit horizontally, upper and lower limits.
		// If set, the interval [ min, max ] must be a sub-interval of [ - 2 PI, 2 PI ], with ( max - min < 2 PI )
		this.minAzimuthAngle = - Infinity; // radians
		this.maxAzimuthAngle = Infinity; // radians

		// Set to true to enable damping (inertia)
		// If damping is enabled, you must call controls.update() in your animation loop
		this.enableDamping = false;
		this.dampingFactor = 0.05;

		// This option actually enables dollying in and out; left as "zoom" for backwards compatibility.
		// Set to false to disable zooming
		this.enableZoom = true;
		this.zoomSpeed = 1.0;

		// Set to false to disable rotating
		this.enableRotate = true;
		this.rotateSpeed = 1.0;

		// Set to false to disable panning
		this.enablePan = true;
		this.panSpeed = 1.0;
		this.screenSpacePanning = true; // if false, pan orthogonal to world-space direction camera.up
		this.keyPanSpeed = 7.0;	// pixels moved per arrow key push
		this.zoomToCursor = false;

		// Set to true to automatically rotate around the target
		// If auto-rotate is enabled, you must call controls.update() in your animation loop
		this.autoRotate = false;
		this.autoRotateSpeed = 2.0; // 30 seconds per orbit when fps is 60

		// The four arrow keys
		this.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };

		// Mouse buttons
		this.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };

		// Touch fingers
		this.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

		// for reset
		this.target0 = this.target.clone();
		this.position0 = this.object.position.clone();
		this.zoom0 = this.object.zoom;

		// the target DOM element for key events
		this._domElementKeyEvents = null;

		//
		// public methods
		//

		this.getPolarAngle = function () {

			return spherical.phi;

		};

		this.getAzimuthalAngle = function () {

			return spherical.theta;

		};

		this.getDistance = function () {

			return this.object.position.distanceTo( this.target );

		};

		this.listenToKeyEvents = function ( domElement ) {

			domElement.addEventListener( 'keydown', onKeyDown );
			this._domElementKeyEvents = domElement;

		};

		this.stopListenToKeyEvents = function () {

			this._domElementKeyEvents.removeEventListener( 'keydown', onKeyDown );
			this._domElementKeyEvents = null;

		};

		this.saveState = function () {

			scope.target0.copy( scope.target );
			scope.position0.copy( scope.object.position );
			scope.zoom0 = scope.object.zoom;

		};

		this.reset = function () {

			scope.target.copy( scope.target0 );
			scope.object.position.copy( scope.position0 );
			scope.object.zoom = scope.zoom0;

			scope.object.updateProjectionMatrix();
			scope.dispatchEvent( _changeEvent );

			scope.update();

			state = STATE.NONE;

		};

		// this method is exposed, but perhaps it would be better if we can make it private...
		this.update = function () {

			const offset = new Vector3();

			// so camera.up is the orbit axis
			const quat = new Quaternion().setFromUnitVectors( object.up, new Vector3( 0, 1, 0 ) );
			const quatInverse = quat.clone().invert();

			const lastPosition = new Vector3();
			const lastQuaternion = new Quaternion();
			const lastTargetPosition = new Vector3();

			const twoPI = 2 * Math.PI;

			return function update( deltaTime = null ) {

				const position = scope.object.position;

				offset.copy( position ).sub( scope.target );

				// rotate offset to "y-axis-is-up" space
				offset.applyQuaternion( quat );

				// angle from z-axis around y-axis
				spherical.setFromVector3( offset );

				if ( scope.autoRotate && state === STATE.NONE ) {

					rotateLeft( getAutoRotationAngle( deltaTime ) );

				}

				if ( scope.enableDamping ) {

					spherical.theta += sphericalDelta.theta * scope.dampingFactor;
					spherical.phi += sphericalDelta.phi * scope.dampingFactor;

				} else {

					spherical.theta += sphericalDelta.theta;
					spherical.phi += sphericalDelta.phi;

				}

				// restrict theta to be between desired limits

				let min = scope.minAzimuthAngle;
				let max = scope.maxAzimuthAngle;

				if ( isFinite( min ) && isFinite( max ) ) {

					if ( min < - Math.PI ) min += twoPI; else if ( min > Math.PI ) min -= twoPI;

					if ( max < - Math.PI ) max += twoPI; else if ( max > Math.PI ) max -= twoPI;

					if ( min <= max ) {

						spherical.theta = Math.max( min, Math.min( max, spherical.theta ) );

					} else {

						spherical.theta = ( spherical.theta > ( min + max ) / 2 ) ?
							Math.max( min, spherical.theta ) :
							Math.min( max, spherical.theta );

					}

				}

				// restrict phi to be between desired limits
				spherical.phi = Math.max( scope.minPolarAngle, Math.min( scope.maxPolarAngle, spherical.phi ) );

				spherical.makeSafe();


				// move target to panned location

				if ( scope.enableDamping === true ) {

					scope.target.addScaledVector( panOffset, scope.dampingFactor );

				} else {

					scope.target.add( panOffset );

				}

				// Limit the target distance from the cursor to create a sphere around the center of interest
				scope.target.sub( scope.cursor );
				scope.target.clampLength( scope.minTargetRadius, scope.maxTargetRadius );
				scope.target.add( scope.cursor );

				// adjust the camera position based on zoom only if we're not zooming to the cursor or if it's an ortho camera
				// we adjust zoom later in these cases
				if ( scope.zoomToCursor && performCursorZoom || scope.object.isOrthographicCamera ) {

					spherical.radius = clampDistance( spherical.radius );

				} else {

					spherical.radius = clampDistance( spherical.radius * scale );

				}

				offset.setFromSpherical( spherical );

				// rotate offset back to "camera-up-vector-is-up" space
				offset.applyQuaternion( quatInverse );

				position.copy( scope.target ).add( offset );

				scope.object.lookAt( scope.target );

				if ( scope.enableDamping === true ) {

					sphericalDelta.theta *= ( 1 - scope.dampingFactor );
					sphericalDelta.phi *= ( 1 - scope.dampingFactor );

					panOffset.multiplyScalar( 1 - scope.dampingFactor );

				} else {

					sphericalDelta.set( 0, 0, 0 );

					panOffset.set( 0, 0, 0 );

				}

				// adjust camera position
				let zoomChanged = false;
				if ( scope.zoomToCursor && performCursorZoom ) {

					let newRadius = null;
					if ( scope.object.isPerspectiveCamera ) {

						// move the camera down the pointer ray
						// this method avoids floating point error
						const prevRadius = offset.length();
						newRadius = clampDistance( prevRadius * scale );

						const radiusDelta = prevRadius - newRadius;
						scope.object.position.addScaledVector( dollyDirection, radiusDelta );
						scope.object.updateMatrixWorld();

					} else if ( scope.object.isOrthographicCamera ) {

						// adjust the ortho camera position based on zoom changes
						const mouseBefore = new Vector3( mouse.x, mouse.y, 0 );
						mouseBefore.unproject( scope.object );

						scope.object.zoom = Math.max( scope.minZoom, Math.min( scope.maxZoom, scope.object.zoom / scale ) );
						scope.object.updateProjectionMatrix();
						zoomChanged = true;

						const mouseAfter = new Vector3( mouse.x, mouse.y, 0 );
						mouseAfter.unproject( scope.object );

						scope.object.position.sub( mouseAfter ).add( mouseBefore );
						scope.object.updateMatrixWorld();

						newRadius = offset.length();

					} else {

						console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.' );
						scope.zoomToCursor = false;

					}

					// handle the placement of the target
					if ( newRadius !== null ) {

						if ( this.screenSpacePanning ) {

							// position the orbit target in front of the new camera position
							scope.target.set( 0, 0, - 1 )
								.transformDirection( scope.object.matrix )
								.multiplyScalar( newRadius )
								.add( scope.object.position );

						} else {

							// get the ray and translation plane to compute target
							_ray.origin.copy( scope.object.position );
							_ray.direction.set( 0, 0, - 1 ).transformDirection( scope.object.matrix );

							// if the camera is 20 degrees above the horizon then don't adjust the focus target to avoid
							// extremely large values
							if ( Math.abs( scope.object.up.dot( _ray.direction ) ) < TILT_LIMIT ) {

								object.lookAt( scope.target );

							} else {

								_plane.setFromNormalAndCoplanarPoint( scope.object.up, scope.target );
								_ray.intersectPlane( _plane, scope.target );

							}

						}

					}

				} else if ( scope.object.isOrthographicCamera ) {

					scope.object.zoom = Math.max( scope.minZoom, Math.min( scope.maxZoom, scope.object.zoom / scale ) );
					scope.object.updateProjectionMatrix();
					zoomChanged = true;

				}

				scale = 1;
				performCursorZoom = false;

				// update condition is:
				// min(camera displacement, camera rotation in radians)^2 > EPS
				// using small-angle approximation cos(x/2) = 1 - x^2 / 8

				if ( zoomChanged ||
					lastPosition.distanceToSquared( scope.object.position ) > EPS ||
					8 * ( 1 - lastQuaternion.dot( scope.object.quaternion ) ) > EPS ||
					lastTargetPosition.distanceToSquared( scope.target ) > 0 ) {

					scope.dispatchEvent( _changeEvent );

					lastPosition.copy( scope.object.position );
					lastQuaternion.copy( scope.object.quaternion );
					lastTargetPosition.copy( scope.target );

					return true;

				}

				return false;

			};

		}();

		this.dispose = function () {

			scope.domElement.removeEventListener( 'contextmenu', onContextMenu );

			scope.domElement.removeEventListener( 'pointerdown', onPointerDown );
			scope.domElement.removeEventListener( 'pointercancel', onPointerUp );
			scope.domElement.removeEventListener( 'wheel', onMouseWheel );

			scope.domElement.removeEventListener( 'pointermove', onPointerMove );
			scope.domElement.removeEventListener( 'pointerup', onPointerUp );


			if ( scope._domElementKeyEvents !== null ) {

				scope._domElementKeyEvents.removeEventListener( 'keydown', onKeyDown );
				scope._domElementKeyEvents = null;

			}

			//scope.dispatchEvent( { type: 'dispose' } ); // should this be added here?

		};

		//
		// internals
		//

		const scope = this;

		const STATE = {
			NONE: - 1,
			ROTATE: 0,
			DOLLY: 1,
			PAN: 2,
			TOUCH_ROTATE: 3,
			TOUCH_PAN: 4,
			TOUCH_DOLLY_PAN: 5,
			TOUCH_DOLLY_ROTATE: 6
		};

		let state = STATE.NONE;

		const EPS = 0.000001;

		// current position in spherical coordinates
		const spherical = new Spherical();
		const sphericalDelta = new Spherical();

		let scale = 1;
		const panOffset = new Vector3();

		const rotateStart = new Vector2();
		const rotateEnd = new Vector2();
		const rotateDelta = new Vector2();

		const panStart = new Vector2();
		const panEnd = new Vector2();
		const panDelta = new Vector2();

		const dollyStart = new Vector2();
		const dollyEnd = new Vector2();
		const dollyDelta = new Vector2();

		const dollyDirection = new Vector3();
		const mouse = new Vector2();
		let performCursorZoom = false;

		const pointers = [];
		const pointerPositions = {};

		function getAutoRotationAngle( deltaTime ) {

			if ( deltaTime !== null ) {

				return ( 2 * Math.PI / 60 * scope.autoRotateSpeed ) * deltaTime;

			} else {

				return 2 * Math.PI / 60 / 60 * scope.autoRotateSpeed;

			}

		}

		function getZoomScale( delta ) {

			const normalized_delta = Math.abs( delta ) / ( 100 * ( window.devicePixelRatio | 0 ) );
			return Math.pow( 0.95, scope.zoomSpeed * normalized_delta );

		}

		function rotateLeft( angle ) {

			sphericalDelta.theta -= angle;

		}

		function rotateUp( angle ) {

			sphericalDelta.phi -= angle;

		}

		const panLeft = function () {

			const v = new Vector3();

			return function panLeft( distance, objectMatrix ) {

				v.setFromMatrixColumn( objectMatrix, 0 ); // get X column of objectMatrix
				v.multiplyScalar( - distance );

				panOffset.add( v );

			};

		}();

		const panUp = function () {

			const v = new Vector3();

			return function panUp( distance, objectMatrix ) {

				if ( scope.screenSpacePanning === true ) {

					v.setFromMatrixColumn( objectMatrix, 1 );

				} else {

					v.setFromMatrixColumn( objectMatrix, 0 );
					v.crossVectors( scope.object.up, v );

				}

				v.multiplyScalar( distance );

				panOffset.add( v );

			};

		}();

		// deltaX and deltaY are in pixels; right and down are positive
		const pan = function () {

			const offset = new Vector3();

			return function pan( deltaX, deltaY ) {

				const element = scope.domElement;

				if ( scope.object.isPerspectiveCamera ) {

					// perspective
					const position = scope.object.position;
					offset.copy( position ).sub( scope.target );
					let targetDistance = offset.length();

					// half of the fov is center to top of screen
					targetDistance *= Math.tan( ( scope.object.fov / 2 ) * Math.PI / 180.0 );

					// we use only clientHeight here so aspect ratio does not distort speed
					panLeft( 2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix );
					panUp( 2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix );

				} else if ( scope.object.isOrthographicCamera ) {

					// orthographic
					panLeft( deltaX * ( scope.object.right - scope.object.left ) / scope.object.zoom / element.clientWidth, scope.object.matrix );
					panUp( deltaY * ( scope.object.top - scope.object.bottom ) / scope.object.zoom / element.clientHeight, scope.object.matrix );

				} else {

					// camera neither orthographic nor perspective
					console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.' );
					scope.enablePan = false;

				}

			};

		}();

		function dollyOut( dollyScale ) {

			if ( scope.object.isPerspectiveCamera || scope.object.isOrthographicCamera ) {

				scale /= dollyScale;

			} else {

				console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
				scope.enableZoom = false;

			}

		}

		function dollyIn( dollyScale ) {

			if ( scope.object.isPerspectiveCamera || scope.object.isOrthographicCamera ) {

				scale *= dollyScale;

			} else {

				console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
				scope.enableZoom = false;

			}

		}

		function updateZoomParameters( x, y ) {

			if ( ! scope.zoomToCursor ) {

				return;

			}

			performCursorZoom = true;

			const rect = scope.domElement.getBoundingClientRect();
			const dx = x - rect.left;
			const dy = y - rect.top;
			const w = rect.width;
			const h = rect.height;

			mouse.x = ( dx / w ) * 2 - 1;
			mouse.y = - ( dy / h ) * 2 + 1;

			dollyDirection.set( mouse.x, mouse.y, 1 ).unproject( scope.object ).sub( scope.object.position ).normalize();

		}

		function clampDistance( dist ) {

			return Math.max( scope.minDistance, Math.min( scope.maxDistance, dist ) );

		}

		//
		// event callbacks - update the object state
		//

		function handleMouseDownRotate( event ) {

			rotateStart.set( event.clientX, event.clientY );

		}

		function handleMouseDownDolly( event ) {

			updateZoomParameters( event.clientX, event.clientX );
			dollyStart.set( event.clientX, event.clientY );

		}

		function handleMouseDownPan( event ) {

			panStart.set( event.clientX, event.clientY );

		}

		function handleMouseMoveRotate( event ) {

			rotateEnd.set( event.clientX, event.clientY );

			rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( scope.rotateSpeed );

			const element = scope.domElement;

			rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientHeight ); // yes, height

			rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight );

			rotateStart.copy( rotateEnd );

			scope.update();

		}

		function handleMouseMoveDolly( event ) {

			dollyEnd.set( event.clientX, event.clientY );

			dollyDelta.subVectors( dollyEnd, dollyStart );

			if ( dollyDelta.y > 0 ) {

				dollyOut( getZoomScale( dollyDelta.y ) );

			} else if ( dollyDelta.y < 0 ) {

				dollyIn( getZoomScale( dollyDelta.y ) );

			}

			dollyStart.copy( dollyEnd );

			scope.update();

		}

		function handleMouseMovePan( event ) {

			panEnd.set( event.clientX, event.clientY );

			panDelta.subVectors( panEnd, panStart ).multiplyScalar( scope.panSpeed );

			pan( panDelta.x, panDelta.y );

			panStart.copy( panEnd );

			scope.update();

		}

		function handleMouseWheel( event ) {

			updateZoomParameters( event.clientX, event.clientY );

			if ( event.deltaY < 0 ) {

				dollyIn( getZoomScale( event.deltaY ) );

			} else if ( event.deltaY > 0 ) {

				dollyOut( getZoomScale( event.deltaY ) );

			}

			scope.update();

		}

		function handleKeyDown( event ) {

			let needsUpdate = false;

			switch ( event.code ) {

				case scope.keys.UP:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						rotateUp( 2 * Math.PI * scope.rotateSpeed / scope.domElement.clientHeight );

					} else {

						pan( 0, scope.keyPanSpeed );

					}

					needsUpdate = true;
					break;

				case scope.keys.BOTTOM:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						rotateUp( - 2 * Math.PI * scope.rotateSpeed / scope.domElement.clientHeight );

					} else {

						pan( 0, - scope.keyPanSpeed );

					}

					needsUpdate = true;
					break;

				case scope.keys.LEFT:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						rotateLeft( 2 * Math.PI * scope.rotateSpeed / scope.domElement.clientHeight );

					} else {

						pan( scope.keyPanSpeed, 0 );

					}

					needsUpdate = true;
					break;

				case scope.keys.RIGHT:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						rotateLeft( - 2 * Math.PI * scope.rotateSpeed / scope.domElement.clientHeight );

					} else {

						pan( - scope.keyPanSpeed, 0 );

					}

					needsUpdate = true;
					break;

			}

			if ( needsUpdate ) {

				// prevent the browser from scrolling on cursor keys
				event.preventDefault();

				scope.update();

			}


		}

		function handleTouchStartRotate( event ) {

			if ( pointers.length === 1 ) {

				rotateStart.set( event.pageX, event.pageY );

			} else {

				const position = getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				rotateStart.set( x, y );

			}

		}

		function handleTouchStartPan( event ) {

			if ( pointers.length === 1 ) {

				panStart.set( event.pageX, event.pageY );

			} else {

				const position = getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				panStart.set( x, y );

			}

		}

		function handleTouchStartDolly( event ) {

			const position = getSecondPointerPosition( event );

			const dx = event.pageX - position.x;
			const dy = event.pageY - position.y;

			const distance = Math.sqrt( dx * dx + dy * dy );

			dollyStart.set( 0, distance );

		}

		function handleTouchStartDollyPan( event ) {

			if ( scope.enableZoom ) handleTouchStartDolly( event );

			if ( scope.enablePan ) handleTouchStartPan( event );

		}

		function handleTouchStartDollyRotate( event ) {

			if ( scope.enableZoom ) handleTouchStartDolly( event );

			if ( scope.enableRotate ) handleTouchStartRotate( event );

		}

		function handleTouchMoveRotate( event ) {

			if ( pointers.length == 1 ) {

				rotateEnd.set( event.pageX, event.pageY );

			} else {

				const position = getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				rotateEnd.set( x, y );

			}

			rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( scope.rotateSpeed );

			const element = scope.domElement;

			rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientHeight ); // yes, height

			rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight );

			rotateStart.copy( rotateEnd );

		}

		function handleTouchMovePan( event ) {

			if ( pointers.length === 1 ) {

				panEnd.set( event.pageX, event.pageY );

			} else {

				const position = getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				panEnd.set( x, y );

			}

			panDelta.subVectors( panEnd, panStart ).multiplyScalar( scope.panSpeed );

			pan( panDelta.x, panDelta.y );

			panStart.copy( panEnd );

		}

		function handleTouchMoveDolly( event ) {

			const position = getSecondPointerPosition( event );

			const dx = event.pageX - position.x;
			const dy = event.pageY - position.y;

			const distance = Math.sqrt( dx * dx + dy * dy );

			dollyEnd.set( 0, distance );

			dollyDelta.set( 0, Math.pow( dollyEnd.y / dollyStart.y, scope.zoomSpeed ) );

			dollyOut( dollyDelta.y );

			dollyStart.copy( dollyEnd );

			const centerX = ( event.pageX + position.x ) * 0.5;
			const centerY = ( event.pageY + position.y ) * 0.5;

			updateZoomParameters( centerX, centerY );

		}

		function handleTouchMoveDollyPan( event ) {

			if ( scope.enableZoom ) handleTouchMoveDolly( event );

			if ( scope.enablePan ) handleTouchMovePan( event );

		}

		function handleTouchMoveDollyRotate( event ) {

			if ( scope.enableZoom ) handleTouchMoveDolly( event );

			if ( scope.enableRotate ) handleTouchMoveRotate( event );

		}

		//
		// event handlers - FSM: listen for events and reset state
		//

		function onPointerDown( event ) {

			if ( scope.enabled === false ) return;

			if ( pointers.length === 0 ) {

				scope.domElement.setPointerCapture( event.pointerId );

				scope.domElement.addEventListener( 'pointermove', onPointerMove );
				scope.domElement.addEventListener( 'pointerup', onPointerUp );

			}

			//

			addPointer( event );

			if ( event.pointerType === 'touch' ) {

				onTouchStart( event );

			} else {

				onMouseDown( event );

			}

		}

		function onPointerMove( event ) {

			if ( scope.enabled === false ) return;

			if ( event.pointerType === 'touch' ) {

				onTouchMove( event );

			} else {

				onMouseMove( event );

			}

		}

		function onPointerUp( event ) {

			removePointer( event );

			if ( pointers.length === 0 ) {

				scope.domElement.releasePointerCapture( event.pointerId );

				scope.domElement.removeEventListener( 'pointermove', onPointerMove );
				scope.domElement.removeEventListener( 'pointerup', onPointerUp );

			}

			scope.dispatchEvent( _endEvent );

			state = STATE.NONE;

		}

		function onMouseDown( event ) {

			let mouseAction;

			switch ( event.button ) {

				case 0:

					mouseAction = scope.mouseButtons.LEFT;
					break;

				case 1:

					mouseAction = scope.mouseButtons.MIDDLE;
					break;

				case 2:

					mouseAction = scope.mouseButtons.RIGHT;
					break;

				default:

					mouseAction = - 1;

			}

			switch ( mouseAction ) {

				case MOUSE.DOLLY:

					if ( scope.enableZoom === false ) return;

					handleMouseDownDolly( event );

					state = STATE.DOLLY;

					break;

				case MOUSE.ROTATE:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						if ( scope.enablePan === false ) return;

						handleMouseDownPan( event );

						state = STATE.PAN;

					} else {

						if ( scope.enableRotate === false ) return;

						handleMouseDownRotate( event );

						state = STATE.ROTATE;

					}

					break;

				case MOUSE.PAN:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						if ( scope.enableRotate === false ) return;

						handleMouseDownRotate( event );

						state = STATE.ROTATE;

					} else {

						if ( scope.enablePan === false ) return;

						handleMouseDownPan( event );

						state = STATE.PAN;

					}

					break;

				default:

					state = STATE.NONE;

			}

			if ( state !== STATE.NONE ) {

				scope.dispatchEvent( _startEvent );

			}

		}

		function onMouseMove( event ) {

			switch ( state ) {

				case STATE.ROTATE:

					if ( scope.enableRotate === false ) return;

					handleMouseMoveRotate( event );

					break;

				case STATE.DOLLY:

					if ( scope.enableZoom === false ) return;

					handleMouseMoveDolly( event );

					break;

				case STATE.PAN:

					if ( scope.enablePan === false ) return;

					handleMouseMovePan( event );

					break;

			}

		}

		function onMouseWheel( event ) {

			if ( scope.enabled === false || scope.enableZoom === false || state !== STATE.NONE ) return;

			event.preventDefault();

			scope.dispatchEvent( _startEvent );

			handleMouseWheel( event );

			scope.dispatchEvent( _endEvent );

		}

		function onKeyDown( event ) {

			if ( scope.enabled === false || scope.enablePan === false ) return;

			handleKeyDown( event );

		}

		function onTouchStart( event ) {

			trackPointer( event );

			switch ( pointers.length ) {

				case 1:

					switch ( scope.touches.ONE ) {

						case TOUCH.ROTATE:

							if ( scope.enableRotate === false ) return;

							handleTouchStartRotate( event );

							state = STATE.TOUCH_ROTATE;

							break;

						case TOUCH.PAN:

							if ( scope.enablePan === false ) return;

							handleTouchStartPan( event );

							state = STATE.TOUCH_PAN;

							break;

						default:

							state = STATE.NONE;

					}

					break;

				case 2:

					switch ( scope.touches.TWO ) {

						case TOUCH.DOLLY_PAN:

							if ( scope.enableZoom === false && scope.enablePan === false ) return;

							handleTouchStartDollyPan( event );

							state = STATE.TOUCH_DOLLY_PAN;

							break;

						case TOUCH.DOLLY_ROTATE:

							if ( scope.enableZoom === false && scope.enableRotate === false ) return;

							handleTouchStartDollyRotate( event );

							state = STATE.TOUCH_DOLLY_ROTATE;

							break;

						default:

							state = STATE.NONE;

					}

					break;

				default:

					state = STATE.NONE;

			}

			if ( state !== STATE.NONE ) {

				scope.dispatchEvent( _startEvent );

			}

		}

		function onTouchMove( event ) {

			trackPointer( event );

			switch ( state ) {

				case STATE.TOUCH_ROTATE:

					if ( scope.enableRotate === false ) return;

					handleTouchMoveRotate( event );

					scope.update();

					break;

				case STATE.TOUCH_PAN:

					if ( scope.enablePan === false ) return;

					handleTouchMovePan( event );

					scope.update();

					break;

				case STATE.TOUCH_DOLLY_PAN:

					if ( scope.enableZoom === false && scope.enablePan === false ) return;

					handleTouchMoveDollyPan( event );

					scope.update();

					break;

				case STATE.TOUCH_DOLLY_ROTATE:

					if ( scope.enableZoom === false && scope.enableRotate === false ) return;

					handleTouchMoveDollyRotate( event );

					scope.update();

					break;

				default:

					state = STATE.NONE;

			}

		}

		function onContextMenu( event ) {

			if ( scope.enabled === false ) return;

			event.preventDefault();

		}

		function addPointer( event ) {

			pointers.push( event.pointerId );

		}

		function removePointer( event ) {

			delete pointerPositions[ event.pointerId ];

			for ( let i = 0; i < pointers.length; i ++ ) {

				if ( pointers[ i ] == event.pointerId ) {

					pointers.splice( i, 1 );
					return;

				}

			}

		}

		function trackPointer( event ) {

			let position = pointerPositions[ event.pointerId ];

			if ( position === undefined ) {

				position = new Vector2();
				pointerPositions[ event.pointerId ] = position;

			}

			position.set( event.pageX, event.pageY );

		}

		function getSecondPointerPosition( event ) {

			const pointerId = ( event.pointerId === pointers[ 0 ] ) ? pointers[ 1 ] : pointers[ 0 ];

			return pointerPositions[ pointerId ];

		}

		//

		scope.domElement.addEventListener( 'contextmenu', onContextMenu );

		scope.domElement.addEventListener( 'pointerdown', onPointerDown );
		scope.domElement.addEventListener( 'pointercancel', onPointerUp );
		scope.domElement.addEventListener( 'wheel', onMouseWheel, { passive: false } );

		// force an update at start

		this.update();

	}

}

window.OrbitControls = OrbitControls;
})();

(() => {
const {
	BoxGeometry,
	BufferGeometry,
	CylinderGeometry,
	DoubleSide,
	Euler,
	Float32BufferAttribute,
	Line,
	LineBasicMaterial,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	OctahedronGeometry,
	PlaneGeometry,
	Quaternion,
	Raycaster,
	SphereGeometry,
	TorusGeometry,
	Vector3
} = THREE;

const _raycaster = new Raycaster();

const _tempVector = new Vector3();
const _tempVector2 = new Vector3();
const _tempQuaternion = new Quaternion();
const _unit = {
	X: new Vector3( 1, 0, 0 ),
	Y: new Vector3( 0, 1, 0 ),
	Z: new Vector3( 0, 0, 1 )
};

const _changeEvent = { type: 'change' };
const _mouseDownEvent = { type: 'mouseDown' };
const _mouseUpEvent = { type: 'mouseUp', mode: null };
const _objectChangeEvent = { type: 'objectChange' };

class TransformControls extends Object3D {

	constructor( camera, domElement ) {

		super();

		if ( domElement === undefined ) {

			console.warn( 'THREE.TransformControls: The second parameter "domElement" is now mandatory.' );
			domElement = document;

		}

		this.isTransformControls = true;

		this.visible = false;
		this.domElement = domElement;
		this.domElement.style.touchAction = 'none'; // disable touch scroll

		const _gizmo = new TransformControlsGizmo();
		this._gizmo = _gizmo;
		this.add( _gizmo );

		const _plane = new TransformControlsPlane();
		this._plane = _plane;
		this.add( _plane );

		const scope = this;

		// Defined getter, setter and store for a property
		function defineProperty( propName, defaultValue ) {

			let propValue = defaultValue;

			Object.defineProperty( scope, propName, {

				get: function () {

					return propValue !== undefined ? propValue : defaultValue;

				},

				set: function ( value ) {

					if ( propValue !== value ) {

						propValue = value;
						_plane[ propName ] = value;
						_gizmo[ propName ] = value;

						scope.dispatchEvent( { type: propName + '-changed', value: value } );
						scope.dispatchEvent( _changeEvent );

					}

				}

			} );

			scope[ propName ] = defaultValue;
			_plane[ propName ] = defaultValue;
			_gizmo[ propName ] = defaultValue;

		}

		// Define properties with getters/setter
		// Setting the defined property will automatically trigger change event
		// Defined properties are passed down to gizmo and plane

		defineProperty( 'camera', camera );
		defineProperty( 'object', undefined );
		defineProperty( 'enabled', true );
		defineProperty( 'axis', null );
		defineProperty( 'mode', 'translate' );
		defineProperty( 'translationSnap', null );
		defineProperty( 'rotationSnap', null );
		defineProperty( 'scaleSnap', null );
		defineProperty( 'space', 'world' );
		defineProperty( 'size', 1 );
		defineProperty( 'dragging', false );
		defineProperty( 'showX', true );
		defineProperty( 'showY', true );
		defineProperty( 'showZ', true );

		// Reusable utility variables

		const worldPosition = new Vector3();
		const worldPositionStart = new Vector3();
		const worldQuaternion = new Quaternion();
		const worldQuaternionStart = new Quaternion();
		const cameraPosition = new Vector3();
		const cameraQuaternion = new Quaternion();
		const pointStart = new Vector3();
		const pointEnd = new Vector3();
		const rotationAxis = new Vector3();
		const rotationAngle = 0;
		const eye = new Vector3();

		// TODO: remove properties unused in plane and gizmo

		defineProperty( 'worldPosition', worldPosition );
		defineProperty( 'worldPositionStart', worldPositionStart );
		defineProperty( 'worldQuaternion', worldQuaternion );
		defineProperty( 'worldQuaternionStart', worldQuaternionStart );
		defineProperty( 'cameraPosition', cameraPosition );
		defineProperty( 'cameraQuaternion', cameraQuaternion );
		defineProperty( 'pointStart', pointStart );
		defineProperty( 'pointEnd', pointEnd );
		defineProperty( 'rotationAxis', rotationAxis );
		defineProperty( 'rotationAngle', rotationAngle );
		defineProperty( 'eye', eye );

		this._offset = new Vector3();
		this._startNorm = new Vector3();
		this._endNorm = new Vector3();
		this._cameraScale = new Vector3();

		this._parentPosition = new Vector3();
		this._parentQuaternion = new Quaternion();
		this._parentQuaternionInv = new Quaternion();
		this._parentScale = new Vector3();

		this._worldScaleStart = new Vector3();
		this._worldQuaternionInv = new Quaternion();
		this._worldScale = new Vector3();

		this._positionStart = new Vector3();
		this._quaternionStart = new Quaternion();
		this._scaleStart = new Vector3();

		this._getPointer = getPointer.bind( this );
		this._onPointerDown = onPointerDown.bind( this );
		this._onPointerHover = onPointerHover.bind( this );
		this._onPointerMove = onPointerMove.bind( this );
		this._onPointerUp = onPointerUp.bind( this );

		this.domElement.addEventListener( 'pointerdown', this._onPointerDown );
		this.domElement.addEventListener( 'pointermove', this._onPointerHover );
		this.domElement.addEventListener( 'pointerup', this._onPointerUp );

	}

	// updateMatrixWorld  updates key transformation variables
	updateMatrixWorld() {

		if ( this.object !== undefined ) {

			this.object.updateMatrixWorld();

			if ( this.object.parent === null ) {

				console.error( 'TransformControls: The attached 3D object must be a part of the scene graph.' );

			} else {

				this.object.parent.matrixWorld.decompose( this._parentPosition, this._parentQuaternion, this._parentScale );

			}

			this.object.matrixWorld.decompose( this.worldPosition, this.worldQuaternion, this._worldScale );

			this._parentQuaternionInv.copy( this._parentQuaternion ).invert();
			this._worldQuaternionInv.copy( this.worldQuaternion ).invert();

		}

		this.camera.updateMatrixWorld();
		this.camera.matrixWorld.decompose( this.cameraPosition, this.cameraQuaternion, this._cameraScale );

		if ( this.camera.isOrthographicCamera ) {

			this.camera.getWorldDirection( this.eye ).negate();

		} else {

			this.eye.copy( this.cameraPosition ).sub( this.worldPosition ).normalize();

		}

		super.updateMatrixWorld( this );

	}

	pointerHover( pointer ) {

		if ( this.object === undefined || this.dragging === true ) return;

		_raycaster.setFromCamera( pointer, this.camera );

		const intersect = intersectObjectWithRay( this._gizmo.picker[ this.mode ], _raycaster );

		if ( intersect ) {

			this.axis = intersect.object.name;

		} else {

			this.axis = null;

		}

	}

	pointerDown( pointer ) {

		if ( this.object === undefined || this.dragging === true || pointer.button !== 0 ) return;

		if ( this.axis !== null ) {

			_raycaster.setFromCamera( pointer, this.camera );

			const planeIntersect = intersectObjectWithRay( this._plane, _raycaster, true );

			if ( planeIntersect ) {

				this.object.updateMatrixWorld();
				this.object.parent.updateMatrixWorld();

				this._positionStart.copy( this.object.position );
				this._quaternionStart.copy( this.object.quaternion );
				this._scaleStart.copy( this.object.scale );

				this.object.matrixWorld.decompose( this.worldPositionStart, this.worldQuaternionStart, this._worldScaleStart );

				this.pointStart.copy( planeIntersect.point ).sub( this.worldPositionStart );

			}

			this.dragging = true;
			_mouseDownEvent.mode = this.mode;
			this.dispatchEvent( _mouseDownEvent );

		}

	}

	pointerMove( pointer ) {

		const axis = this.axis;
		const mode = this.mode;
		const object = this.object;
		let space = this.space;

		if ( mode === 'scale' ) {

			space = 'local';

		} else if ( axis === 'E' || axis === 'XYZE' || axis === 'XYZ' ) {

			space = 'world';

		}

		if ( object === undefined || axis === null || this.dragging === false || pointer.button !== - 1 ) return;

		_raycaster.setFromCamera( pointer, this.camera );

		const planeIntersect = intersectObjectWithRay( this._plane, _raycaster, true );

		if ( ! planeIntersect ) return;

		this.pointEnd.copy( planeIntersect.point ).sub( this.worldPositionStart );

		if ( mode === 'translate' ) {

			// Apply translate

			this._offset.copy( this.pointEnd ).sub( this.pointStart );

			if ( space === 'local' && axis !== 'XYZ' ) {

				this._offset.applyQuaternion( this._worldQuaternionInv );

			}

			if ( axis.indexOf( 'X' ) === - 1 ) this._offset.x = 0;
			if ( axis.indexOf( 'Y' ) === - 1 ) this._offset.y = 0;
			if ( axis.indexOf( 'Z' ) === - 1 ) this._offset.z = 0;

			if ( space === 'local' && axis !== 'XYZ' ) {

				this._offset.applyQuaternion( this._quaternionStart ).divide( this._parentScale );

			} else {

				this._offset.applyQuaternion( this._parentQuaternionInv ).divide( this._parentScale );

			}

			object.position.copy( this._offset ).add( this._positionStart );

			// Apply translation snap

			if ( this.translationSnap ) {

				if ( space === 'local' ) {

					object.position.applyQuaternion( _tempQuaternion.copy( this._quaternionStart ).invert() );

					if ( axis.search( 'X' ) !== - 1 ) {

						object.position.x = Math.round( object.position.x / this.translationSnap ) * this.translationSnap;

					}

					if ( axis.search( 'Y' ) !== - 1 ) {

						object.position.y = Math.round( object.position.y / this.translationSnap ) * this.translationSnap;

					}

					if ( axis.search( 'Z' ) !== - 1 ) {

						object.position.z = Math.round( object.position.z / this.translationSnap ) * this.translationSnap;

					}

					object.position.applyQuaternion( this._quaternionStart );

				}

				if ( space === 'world' ) {

					if ( object.parent ) {

						object.position.add( _tempVector.setFromMatrixPosition( object.parent.matrixWorld ) );

					}

					if ( axis.search( 'X' ) !== - 1 ) {

						object.position.x = Math.round( object.position.x / this.translationSnap ) * this.translationSnap;

					}

					if ( axis.search( 'Y' ) !== - 1 ) {

						object.position.y = Math.round( object.position.y / this.translationSnap ) * this.translationSnap;

					}

					if ( axis.search( 'Z' ) !== - 1 ) {

						object.position.z = Math.round( object.position.z / this.translationSnap ) * this.translationSnap;

					}

					if ( object.parent ) {

						object.position.sub( _tempVector.setFromMatrixPosition( object.parent.matrixWorld ) );

					}

				}

			}

		} else if ( mode === 'scale' ) {

			if ( axis.search( 'XYZ' ) !== - 1 ) {

				let d = this.pointEnd.length() / this.pointStart.length();

				if ( this.pointEnd.dot( this.pointStart ) < 0 ) d *= - 1;

				_tempVector2.set( d, d, d );

			} else {

				_tempVector.copy( this.pointStart );
				_tempVector2.copy( this.pointEnd );

				_tempVector.applyQuaternion( this._worldQuaternionInv );
				_tempVector2.applyQuaternion( this._worldQuaternionInv );

				_tempVector2.divide( _tempVector );

				if ( axis.search( 'X' ) === - 1 ) {

					_tempVector2.x = 1;

				}

				if ( axis.search( 'Y' ) === - 1 ) {

					_tempVector2.y = 1;

				}

				if ( axis.search( 'Z' ) === - 1 ) {

					_tempVector2.z = 1;

				}

			}

			// Apply scale

			object.scale.copy( this._scaleStart ).multiply( _tempVector2 );

			if ( this.scaleSnap ) {

				if ( axis.search( 'X' ) !== - 1 ) {

					object.scale.x = Math.round( object.scale.x / this.scaleSnap ) * this.scaleSnap || this.scaleSnap;

				}

				if ( axis.search( 'Y' ) !== - 1 ) {

					object.scale.y = Math.round( object.scale.y / this.scaleSnap ) * this.scaleSnap || this.scaleSnap;

				}

				if ( axis.search( 'Z' ) !== - 1 ) {

					object.scale.z = Math.round( object.scale.z / this.scaleSnap ) * this.scaleSnap || this.scaleSnap;

				}

			}

		} else if ( mode === 'rotate' ) {

			this._offset.copy( this.pointEnd ).sub( this.pointStart );

			const ROTATION_SPEED = 20 / this.worldPosition.distanceTo( _tempVector.setFromMatrixPosition( this.camera.matrixWorld ) );

			let _inPlaneRotation = false;

			if ( axis === 'XYZE' ) {

				this.rotationAxis.copy( this._offset ).cross( this.eye ).normalize();
				this.rotationAngle = this._offset.dot( _tempVector.copy( this.rotationAxis ).cross( this.eye ) ) * ROTATION_SPEED;

			} else if ( axis === 'X' || axis === 'Y' || axis === 'Z' ) {

				this.rotationAxis.copy( _unit[ axis ] );

				_tempVector.copy( _unit[ axis ] );

				if ( space === 'local' ) {

					_tempVector.applyQuaternion( this.worldQuaternion );

				}

				_tempVector.cross( this.eye );

				// When _tempVector is 0 after cross with this.eye the vectors are parallel and should use in-plane rotation logic.
				if ( _tempVector.length() === 0 ) {

					_inPlaneRotation = true;

				} else {

					this.rotationAngle = this._offset.dot( _tempVector.normalize() ) * ROTATION_SPEED;

				}


			}

			if ( axis === 'E' || _inPlaneRotation ) {

				this.rotationAxis.copy( this.eye );
				this.rotationAngle = this.pointEnd.angleTo( this.pointStart );

				this._startNorm.copy( this.pointStart ).normalize();
				this._endNorm.copy( this.pointEnd ).normalize();

				this.rotationAngle *= ( this._endNorm.cross( this._startNorm ).dot( this.eye ) < 0 ? 1 : - 1 );

			}

			// Apply rotation snap

			if ( this.rotationSnap ) this.rotationAngle = Math.round( this.rotationAngle / this.rotationSnap ) * this.rotationSnap;

			// Apply rotate
			if ( space === 'local' && axis !== 'E' && axis !== 'XYZE' ) {

				object.quaternion.copy( this._quaternionStart );
				object.quaternion.multiply( _tempQuaternion.setFromAxisAngle( this.rotationAxis, this.rotationAngle ) ).normalize();

			} else {

				this.rotationAxis.applyQuaternion( this._parentQuaternionInv );
				object.quaternion.copy( _tempQuaternion.setFromAxisAngle( this.rotationAxis, this.rotationAngle ) );
				object.quaternion.multiply( this._quaternionStart ).normalize();

			}

		}

		this.dispatchEvent( _changeEvent );
		this.dispatchEvent( _objectChangeEvent );

	}

	pointerUp( pointer ) {

		if ( pointer.button !== 0 ) return;

		if ( this.dragging && ( this.axis !== null ) ) {

			_mouseUpEvent.mode = this.mode;
			this.dispatchEvent( _mouseUpEvent );

		}

		this.dragging = false;
		this.axis = null;

	}

	dispose() {

		this.domElement.removeEventListener( 'pointerdown', this._onPointerDown );
		this.domElement.removeEventListener( 'pointermove', this._onPointerHover );
		this.domElement.removeEventListener( 'pointermove', this._onPointerMove );
		this.domElement.removeEventListener( 'pointerup', this._onPointerUp );

		this.traverse( function ( child ) {

			if ( child.geometry ) child.geometry.dispose();
			if ( child.material ) child.material.dispose();

		} );

	}

	// Set current object
	attach( object ) {

		this.object = object;
		this.visible = true;

		return this;

	}

	// Detach from object
	detach() {

		this.object = undefined;
		this.visible = false;
		this.axis = null;

		return this;

	}

	reset() {

		if ( ! this.enabled ) return;

		if ( this.dragging ) {

			this.object.position.copy( this._positionStart );
			this.object.quaternion.copy( this._quaternionStart );
			this.object.scale.copy( this._scaleStart );

			this.dispatchEvent( _changeEvent );
			this.dispatchEvent( _objectChangeEvent );

			this.pointStart.copy( this.pointEnd );

		}

	}

	getRaycaster() {

		return _raycaster;

	}

	// TODO: deprecate

	getMode() {

		return this.mode;

	}

	setMode( mode ) {

		this.mode = mode;

	}

	setTranslationSnap( translationSnap ) {

		this.translationSnap = translationSnap;

	}

	setRotationSnap( rotationSnap ) {

		this.rotationSnap = rotationSnap;

	}

	setScaleSnap( scaleSnap ) {

		this.scaleSnap = scaleSnap;

	}

	setSize( size ) {

		this.size = size;

	}

	setSpace( space ) {

		this.space = space;

	}

}

// mouse / touch event handlers

function getPointer( event ) {

	if ( this.domElement.ownerDocument.pointerLockElement ) {

		return {
			x: 0,
			y: 0,
			button: event.button
		};

	} else {

		const rect = this.domElement.getBoundingClientRect();

		return {
			x: ( event.clientX - rect.left ) / rect.width * 2 - 1,
			y: - ( event.clientY - rect.top ) / rect.height * 2 + 1,
			button: event.button
		};

	}

}

function onPointerHover( event ) {

	if ( ! this.enabled ) return;

	switch ( event.pointerType ) {

		case 'mouse':
		case 'pen':
			this.pointerHover( this._getPointer( event ) );
			break;

	}

}

function onPointerDown( event ) {

	if ( ! this.enabled ) return;

	if ( ! document.pointerLockElement ) {

		this.domElement.setPointerCapture( event.pointerId );

	}

	this.domElement.addEventListener( 'pointermove', this._onPointerMove );

	this.pointerHover( this._getPointer( event ) );
	this.pointerDown( this._getPointer( event ) );

}

function onPointerMove( event ) {

	if ( ! this.enabled ) return;

	this.pointerMove( this._getPointer( event ) );

}

function onPointerUp( event ) {

	if ( ! this.enabled ) return;

	this.domElement.releasePointerCapture( event.pointerId );

	this.domElement.removeEventListener( 'pointermove', this._onPointerMove );

	this.pointerUp( this._getPointer( event ) );

}

function intersectObjectWithRay( object, raycaster, includeInvisible ) {

	const allIntersections = raycaster.intersectObject( object, true );

	for ( let i = 0; i < allIntersections.length; i ++ ) {

		if ( allIntersections[ i ].object.visible || includeInvisible ) {

			return allIntersections[ i ];

		}

	}

	return false;

}

//

// Reusable utility variables

const _tempEuler = new Euler();
const _alignVector = new Vector3( 0, 1, 0 );
const _zeroVector = new Vector3( 0, 0, 0 );
const _lookAtMatrix = new Matrix4();
const _tempQuaternion2 = new Quaternion();
const _identityQuaternion = new Quaternion();
const _dirVector = new Vector3();
const _tempMatrix = new Matrix4();

const _unitX = new Vector3( 1, 0, 0 );
const _unitY = new Vector3( 0, 1, 0 );
const _unitZ = new Vector3( 0, 0, 1 );

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();

class TransformControlsGizmo extends Object3D {

	constructor() {

		super();

		this.isTransformControlsGizmo = true;

		this.type = 'TransformControlsGizmo';

		// shared materials

		const gizmoMaterial = new MeshBasicMaterial( {
			depthTest: false,
			depthWrite: false,
			fog: false,
			toneMapped: false,
			transparent: true
		} );

		const gizmoLineMaterial = new LineBasicMaterial( {
			depthTest: false,
			depthWrite: false,
			fog: false,
			toneMapped: false,
			transparent: true
		} );

		// Make unique material for each axis/color

		const matInvisible = gizmoMaterial.clone();
		matInvisible.opacity = 0.15;

		const matHelper = gizmoLineMaterial.clone();
		matHelper.opacity = 0.5;

		const matRed = gizmoMaterial.clone();
		matRed.color.setHex( 0xff0000 );

		const matGreen = gizmoMaterial.clone();
		matGreen.color.setHex( 0x00ff00 );

		const matBlue = gizmoMaterial.clone();
		matBlue.color.setHex( 0x0000ff );

		const matRedTransparent = gizmoMaterial.clone();
		matRedTransparent.color.setHex( 0xff0000 );
		matRedTransparent.opacity = 0.5;

		const matGreenTransparent = gizmoMaterial.clone();
		matGreenTransparent.color.setHex( 0x00ff00 );
		matGreenTransparent.opacity = 0.5;

		const matBlueTransparent = gizmoMaterial.clone();
		matBlueTransparent.color.setHex( 0x0000ff );
		matBlueTransparent.opacity = 0.5;

		const matWhiteTransparent = gizmoMaterial.clone();
		matWhiteTransparent.opacity = 0.25;

		const matYellowTransparent = gizmoMaterial.clone();
		matYellowTransparent.color.setHex( 0xffff00 );
		matYellowTransparent.opacity = 0.25;

		const matYellow = gizmoMaterial.clone();
		matYellow.color.setHex( 0xffff00 );

		const matGray = gizmoMaterial.clone();
		matGray.color.setHex( 0x787878 );

		// reusable geometry

		const arrowGeometry = new CylinderGeometry( 0, 0.04, 0.1, 12 );
		arrowGeometry.translate( 0, 0.05, 0 );

		const scaleHandleGeometry = new BoxGeometry( 0.08, 0.08, 0.08 );
		scaleHandleGeometry.translate( 0, 0.04, 0 );

		const lineGeometry = new BufferGeometry();
		lineGeometry.setAttribute( 'position', new Float32BufferAttribute( [ 0, 0, 0,	1, 0, 0 ], 3 ) );

		const lineGeometry2 = new CylinderGeometry( 0.0075, 0.0075, 0.5, 3 );
		lineGeometry2.translate( 0, 0.25, 0 );

		function CircleGeometry( radius, arc ) {

			const geometry = new TorusGeometry( radius, 0.0075, 3, 64, arc * Math.PI * 2 );
			geometry.rotateY( Math.PI / 2 );
			geometry.rotateX( Math.PI / 2 );
			return geometry;

		}

		// Special geometry for transform helper. If scaled with position vector it spans from [0,0,0] to position

		function TranslateHelperGeometry() {

			const geometry = new BufferGeometry();

			geometry.setAttribute( 'position', new Float32BufferAttribute( [ 0, 0, 0, 1, 1, 1 ], 3 ) );

			return geometry;

		}

		// Gizmo definitions - custom hierarchy definitions for setupGizmo() function

		const gizmoTranslate = {
			X: [
				[ new Mesh( arrowGeometry, matRed ), [ 0.5, 0, 0 ], [ 0, 0, - Math.PI / 2 ]],
				[ new Mesh( arrowGeometry, matRed ), [ - 0.5, 0, 0 ], [ 0, 0, Math.PI / 2 ]],
				[ new Mesh( lineGeometry2, matRed ), [ 0, 0, 0 ], [ 0, 0, - Math.PI / 2 ]]
			],
			Y: [
				[ new Mesh( arrowGeometry, matGreen ), [ 0, 0.5, 0 ]],
				[ new Mesh( arrowGeometry, matGreen ), [ 0, - 0.5, 0 ], [ Math.PI, 0, 0 ]],
				[ new Mesh( lineGeometry2, matGreen ) ]
			],
			Z: [
				[ new Mesh( arrowGeometry, matBlue ), [ 0, 0, 0.5 ], [ Math.PI / 2, 0, 0 ]],
				[ new Mesh( arrowGeometry, matBlue ), [ 0, 0, - 0.5 ], [ - Math.PI / 2, 0, 0 ]],
				[ new Mesh( lineGeometry2, matBlue ), null, [ Math.PI / 2, 0, 0 ]]
			],
			XYZ: [
				[ new Mesh( new OctahedronGeometry( 0.1, 0 ), matWhiteTransparent.clone() ), [ 0, 0, 0 ]]
			],
			XY: [
				[ new Mesh( new BoxGeometry( 0.15, 0.15, 0.01 ), matBlueTransparent.clone() ), [ 0.15, 0.15, 0 ]]
			],
			YZ: [
				[ new Mesh( new BoxGeometry( 0.15, 0.15, 0.01 ), matRedTransparent.clone() ), [ 0, 0.15, 0.15 ], [ 0, Math.PI / 2, 0 ]]
			],
			XZ: [
				[ new Mesh( new BoxGeometry( 0.15, 0.15, 0.01 ), matGreenTransparent.clone() ), [ 0.15, 0, 0.15 ], [ - Math.PI / 2, 0, 0 ]]
			]
		};

		const pickerTranslate = {
			X: [
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ 0.3, 0, 0 ], [ 0, 0, - Math.PI / 2 ]],
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ - 0.3, 0, 0 ], [ 0, 0, Math.PI / 2 ]]
			],
			Y: [
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ 0, 0.3, 0 ]],
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ 0, - 0.3, 0 ], [ 0, 0, Math.PI ]]
			],
			Z: [
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ 0, 0, 0.3 ], [ Math.PI / 2, 0, 0 ]],
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ 0, 0, - 0.3 ], [ - Math.PI / 2, 0, 0 ]]
			],
			XYZ: [
				[ new Mesh( new OctahedronGeometry( 0.2, 0 ), matInvisible ) ]
			],
			XY: [
				[ new Mesh( new BoxGeometry( 0.2, 0.2, 0.01 ), matInvisible ), [ 0.15, 0.15, 0 ]]
			],
			YZ: [
				[ new Mesh( new BoxGeometry( 0.2, 0.2, 0.01 ), matInvisible ), [ 0, 0.15, 0.15 ], [ 0, Math.PI / 2, 0 ]]
			],
			XZ: [
				[ new Mesh( new BoxGeometry( 0.2, 0.2, 0.01 ), matInvisible ), [ 0.15, 0, 0.15 ], [ - Math.PI / 2, 0, 0 ]]
			]
		};

		const helperTranslate = {
			START: [
				[ new Mesh( new OctahedronGeometry( 0.01, 2 ), matHelper ), null, null, null, 'helper' ]
			],
			END: [
				[ new Mesh( new OctahedronGeometry( 0.01, 2 ), matHelper ), null, null, null, 'helper' ]
			],
			DELTA: [
				[ new Line( TranslateHelperGeometry(), matHelper ), null, null, null, 'helper' ]
			],
			X: [
				[ new Line( lineGeometry, matHelper.clone() ), [ - 1e3, 0, 0 ], null, [ 1e6, 1, 1 ], 'helper' ]
			],
			Y: [
				[ new Line( lineGeometry, matHelper.clone() ), [ 0, - 1e3, 0 ], [ 0, 0, Math.PI / 2 ], [ 1e6, 1, 1 ], 'helper' ]
			],
			Z: [
				[ new Line( lineGeometry, matHelper.clone() ), [ 0, 0, - 1e3 ], [ 0, - Math.PI / 2, 0 ], [ 1e6, 1, 1 ], 'helper' ]
			]
		};

		const gizmoRotate = {
			XYZE: [
				[ new Mesh( CircleGeometry( 0.5, 1 ), matGray ), null, [ 0, Math.PI / 2, 0 ]]
			],
			X: [
				[ new Mesh( CircleGeometry( 0.5, 0.5 ), matRed ) ]
			],
			Y: [
				[ new Mesh( CircleGeometry( 0.5, 0.5 ), matGreen ), null, [ 0, 0, - Math.PI / 2 ]]
			],
			Z: [
				[ new Mesh( CircleGeometry( 0.5, 0.5 ), matBlue ), null, [ 0, Math.PI / 2, 0 ]]
			],
			E: [
				[ new Mesh( CircleGeometry( 0.75, 1 ), matYellowTransparent ), null, [ 0, Math.PI / 2, 0 ]]
			]
		};

		const helperRotate = {
			AXIS: [
				[ new Line( lineGeometry, matHelper.clone() ), [ - 1e3, 0, 0 ], null, [ 1e6, 1, 1 ], 'helper' ]
			]
		};

		const pickerRotate = {
			XYZE: [
				[ new Mesh( new SphereGeometry( 0.25, 10, 8 ), matInvisible ) ]
			],
			X: [
				[ new Mesh( new TorusGeometry( 0.5, 0.1, 4, 24 ), matInvisible ), [ 0, 0, 0 ], [ 0, - Math.PI / 2, - Math.PI / 2 ]],
			],
			Y: [
				[ new Mesh( new TorusGeometry( 0.5, 0.1, 4, 24 ), matInvisible ), [ 0, 0, 0 ], [ Math.PI / 2, 0, 0 ]],
			],
			Z: [
				[ new Mesh( new TorusGeometry( 0.5, 0.1, 4, 24 ), matInvisible ), [ 0, 0, 0 ], [ 0, 0, - Math.PI / 2 ]],
			],
			E: [
				[ new Mesh( new TorusGeometry( 0.75, 0.1, 2, 24 ), matInvisible ) ]
			]
		};

		const gizmoScale = {
			X: [
				[ new Mesh( scaleHandleGeometry, matRed ), [ 0.5, 0, 0 ], [ 0, 0, - Math.PI / 2 ]],
				[ new Mesh( lineGeometry2, matRed ), [ 0, 0, 0 ], [ 0, 0, - Math.PI / 2 ]],
				[ new Mesh( scaleHandleGeometry, matRed ), [ - 0.5, 0, 0 ], [ 0, 0, Math.PI / 2 ]],
			],
			Y: [
				[ new Mesh( scaleHandleGeometry, matGreen ), [ 0, 0.5, 0 ]],
				[ new Mesh( lineGeometry2, matGreen ) ],
				[ new Mesh( scaleHandleGeometry, matGreen ), [ 0, - 0.5, 0 ], [ 0, 0, Math.PI ]],
			],
			Z: [
				[ new Mesh( scaleHandleGeometry, matBlue ), [ 0, 0, 0.5 ], [ Math.PI / 2, 0, 0 ]],
				[ new Mesh( lineGeometry2, matBlue ), [ 0, 0, 0 ], [ Math.PI / 2, 0, 0 ]],
				[ new Mesh( scaleHandleGeometry, matBlue ), [ 0, 0, - 0.5 ], [ - Math.PI / 2, 0, 0 ]]
			],
			XY: [
				[ new Mesh( new BoxGeometry( 0.15, 0.15, 0.01 ), matBlueTransparent ), [ 0.15, 0.15, 0 ]]
			],
			YZ: [
				[ new Mesh( new BoxGeometry( 0.15, 0.15, 0.01 ), matRedTransparent ), [ 0, 0.15, 0.15 ], [ 0, Math.PI / 2, 0 ]]
			],
			XZ: [
				[ new Mesh( new BoxGeometry( 0.15, 0.15, 0.01 ), matGreenTransparent ), [ 0.15, 0, 0.15 ], [ - Math.PI / 2, 0, 0 ]]
			],
			XYZ: [
				[ new Mesh( new BoxGeometry( 0.1, 0.1, 0.1 ), matWhiteTransparent.clone() ) ],
			]
		};

		const pickerScale = {
			X: [
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ 0.3, 0, 0 ], [ 0, 0, - Math.PI / 2 ]],
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ - 0.3, 0, 0 ], [ 0, 0, Math.PI / 2 ]]
			],
			Y: [
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ 0, 0.3, 0 ]],
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ 0, - 0.3, 0 ], [ 0, 0, Math.PI ]]
			],
			Z: [
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ 0, 0, 0.3 ], [ Math.PI / 2, 0, 0 ]],
				[ new Mesh( new CylinderGeometry( 0.2, 0, 0.6, 4 ), matInvisible ), [ 0, 0, - 0.3 ], [ - Math.PI / 2, 0, 0 ]]
			],
			XY: [
				[ new Mesh( new BoxGeometry( 0.2, 0.2, 0.01 ), matInvisible ), [ 0.15, 0.15, 0 ]],
			],
			YZ: [
				[ new Mesh( new BoxGeometry( 0.2, 0.2, 0.01 ), matInvisible ), [ 0, 0.15, 0.15 ], [ 0, Math.PI / 2, 0 ]],
			],
			XZ: [
				[ new Mesh( new BoxGeometry( 0.2, 0.2, 0.01 ), matInvisible ), [ 0.15, 0, 0.15 ], [ - Math.PI / 2, 0, 0 ]],
			],
			XYZ: [
				[ new Mesh( new BoxGeometry( 0.2, 0.2, 0.2 ), matInvisible ), [ 0, 0, 0 ]],
			]
		};

		const helperScale = {
			X: [
				[ new Line( lineGeometry, matHelper.clone() ), [ - 1e3, 0, 0 ], null, [ 1e6, 1, 1 ], 'helper' ]
			],
			Y: [
				[ new Line( lineGeometry, matHelper.clone() ), [ 0, - 1e3, 0 ], [ 0, 0, Math.PI / 2 ], [ 1e6, 1, 1 ], 'helper' ]
			],
			Z: [
				[ new Line( lineGeometry, matHelper.clone() ), [ 0, 0, - 1e3 ], [ 0, - Math.PI / 2, 0 ], [ 1e6, 1, 1 ], 'helper' ]
			]
		};

		// Creates an Object3D with gizmos described in custom hierarchy definition.

		function setupGizmo( gizmoMap ) {

			const gizmo = new Object3D();

			for ( const name in gizmoMap ) {

				for ( let i = gizmoMap[ name ].length; i --; ) {

					const object = gizmoMap[ name ][ i ][ 0 ].clone();
					const position = gizmoMap[ name ][ i ][ 1 ];
					const rotation = gizmoMap[ name ][ i ][ 2 ];
					const scale = gizmoMap[ name ][ i ][ 3 ];
					const tag = gizmoMap[ name ][ i ][ 4 ];

					// name and tag properties are essential for picking and updating logic.
					object.name = name;
					object.tag = tag;

					if ( position ) {

						object.position.set( position[ 0 ], position[ 1 ], position[ 2 ] );

					}

					if ( rotation ) {

						object.rotation.set( rotation[ 0 ], rotation[ 1 ], rotation[ 2 ] );

					}

					if ( scale ) {

						object.scale.set( scale[ 0 ], scale[ 1 ], scale[ 2 ] );

					}

					object.updateMatrix();

					const tempGeometry = object.geometry.clone();
					tempGeometry.applyMatrix4( object.matrix );
					object.geometry = tempGeometry;
					object.renderOrder = Infinity;

					object.position.set( 0, 0, 0 );
					object.rotation.set( 0, 0, 0 );
					object.scale.set( 1, 1, 1 );

					gizmo.add( object );

				}

			}

			return gizmo;

		}

		// Gizmo creation

		this.gizmo = {};
		this.picker = {};
		this.helper = {};

		this.add( this.gizmo[ 'translate' ] = setupGizmo( gizmoTranslate ) );
		this.add( this.gizmo[ 'rotate' ] = setupGizmo( gizmoRotate ) );
		this.add( this.gizmo[ 'scale' ] = setupGizmo( gizmoScale ) );
		this.add( this.picker[ 'translate' ] = setupGizmo( pickerTranslate ) );
		this.add( this.picker[ 'rotate' ] = setupGizmo( pickerRotate ) );
		this.add( this.picker[ 'scale' ] = setupGizmo( pickerScale ) );
		this.add( this.helper[ 'translate' ] = setupGizmo( helperTranslate ) );
		this.add( this.helper[ 'rotate' ] = setupGizmo( helperRotate ) );
		this.add( this.helper[ 'scale' ] = setupGizmo( helperScale ) );

		// Pickers should be hidden always

		this.picker[ 'translate' ].visible = false;
		this.picker[ 'rotate' ].visible = false;
		this.picker[ 'scale' ].visible = false;

	}

	// updateMatrixWorld will update transformations and appearance of individual handles

	updateMatrixWorld( force ) {

		const space = ( this.mode === 'scale' ) ? 'local' : this.space; // scale always oriented to local rotation

		const quaternion = ( space === 'local' ) ? this.worldQuaternion : _identityQuaternion;

		// Show only gizmos for current transform mode

		this.gizmo[ 'translate' ].visible = this.mode === 'translate';
		this.gizmo[ 'rotate' ].visible = this.mode === 'rotate';
		this.gizmo[ 'scale' ].visible = this.mode === 'scale';

		this.helper[ 'translate' ].visible = this.mode === 'translate';
		this.helper[ 'rotate' ].visible = this.mode === 'rotate';
		this.helper[ 'scale' ].visible = this.mode === 'scale';


		let handles = [];
		handles = handles.concat( this.picker[ this.mode ].children );
		handles = handles.concat( this.gizmo[ this.mode ].children );
		handles = handles.concat( this.helper[ this.mode ].children );

		for ( let i = 0; i < handles.length; i ++ ) {

			const handle = handles[ i ];

			// hide aligned to camera

			handle.visible = true;
			handle.rotation.set( 0, 0, 0 );
			handle.position.copy( this.worldPosition );

			let factor;

			if ( this.camera.isOrthographicCamera ) {

				factor = ( this.camera.top - this.camera.bottom ) / this.camera.zoom;

			} else {

				factor = this.worldPosition.distanceTo( this.cameraPosition ) * Math.min( 1.9 * Math.tan( Math.PI * this.camera.fov / 360 ) / this.camera.zoom, 7 );

			}

			handle.scale.set( 1, 1, 1 ).multiplyScalar( factor * this.size / 4 );

			// TODO: simplify helpers and consider decoupling from gizmo

			if ( handle.tag === 'helper' ) {

				handle.visible = false;

				if ( handle.name === 'AXIS' ) {

					handle.visible = !! this.axis;

					if ( this.axis === 'X' ) {

						_tempQuaternion.setFromEuler( _tempEuler.set( 0, 0, 0 ) );
						handle.quaternion.copy( quaternion ).multiply( _tempQuaternion );

						if ( Math.abs( _alignVector.copy( _unitX ).applyQuaternion( quaternion ).dot( this.eye ) ) > 0.9 ) {

							handle.visible = false;

						}

					}

					if ( this.axis === 'Y' ) {

						_tempQuaternion.setFromEuler( _tempEuler.set( 0, 0, Math.PI / 2 ) );
						handle.quaternion.copy( quaternion ).multiply( _tempQuaternion );

						if ( Math.abs( _alignVector.copy( _unitY ).applyQuaternion( quaternion ).dot( this.eye ) ) > 0.9 ) {

							handle.visible = false;

						}

					}

					if ( this.axis === 'Z' ) {

						_tempQuaternion.setFromEuler( _tempEuler.set( 0, Math.PI / 2, 0 ) );
						handle.quaternion.copy( quaternion ).multiply( _tempQuaternion );

						if ( Math.abs( _alignVector.copy( _unitZ ).applyQuaternion( quaternion ).dot( this.eye ) ) > 0.9 ) {

							handle.visible = false;

						}

					}

					if ( this.axis === 'XYZE' ) {

						_tempQuaternion.setFromEuler( _tempEuler.set( 0, Math.PI / 2, 0 ) );
						_alignVector.copy( this.rotationAxis );
						handle.quaternion.setFromRotationMatrix( _lookAtMatrix.lookAt( _zeroVector, _alignVector, _unitY ) );
						handle.quaternion.multiply( _tempQuaternion );
						handle.visible = this.dragging;

					}

					if ( this.axis === 'E' ) {

						handle.visible = false;

					}


				} else if ( handle.name === 'START' ) {

					handle.position.copy( this.worldPositionStart );
					handle.visible = this.dragging;

				} else if ( handle.name === 'END' ) {

					handle.position.copy( this.worldPosition );
					handle.visible = this.dragging;

				} else if ( handle.name === 'DELTA' ) {

					handle.position.copy( this.worldPositionStart );
					handle.quaternion.copy( this.worldQuaternionStart );
					_tempVector.set( 1e-10, 1e-10, 1e-10 ).add( this.worldPositionStart ).sub( this.worldPosition ).multiplyScalar( - 1 );
					_tempVector.applyQuaternion( this.worldQuaternionStart.clone().invert() );
					handle.scale.copy( _tempVector );
					handle.visible = this.dragging;

				} else {

					handle.quaternion.copy( quaternion );

					if ( this.dragging ) {

						handle.position.copy( this.worldPositionStart );

					} else {

						handle.position.copy( this.worldPosition );

					}

					if ( this.axis ) {

						handle.visible = this.axis.search( handle.name ) !== - 1;

					}

				}

				// If updating helper, skip rest of the loop
				continue;

			}

			// Align handles to current local or world rotation

			handle.quaternion.copy( quaternion );

			if ( this.mode === 'translate' || this.mode === 'scale' ) {

				// Hide translate and scale axis facing the camera

				const AXIS_HIDE_THRESHOLD = 0.99;
				const PLANE_HIDE_THRESHOLD = 0.2;

				if ( handle.name === 'X' ) {

					if ( Math.abs( _alignVector.copy( _unitX ).applyQuaternion( quaternion ).dot( this.eye ) ) > AXIS_HIDE_THRESHOLD ) {

						handle.scale.set( 1e-10, 1e-10, 1e-10 );
						handle.visible = false;

					}

				}

				if ( handle.name === 'Y' ) {

					if ( Math.abs( _alignVector.copy( _unitY ).applyQuaternion( quaternion ).dot( this.eye ) ) > AXIS_HIDE_THRESHOLD ) {

						handle.scale.set( 1e-10, 1e-10, 1e-10 );
						handle.visible = false;

					}

				}

				if ( handle.name === 'Z' ) {

					if ( Math.abs( _alignVector.copy( _unitZ ).applyQuaternion( quaternion ).dot( this.eye ) ) > AXIS_HIDE_THRESHOLD ) {

						handle.scale.set( 1e-10, 1e-10, 1e-10 );
						handle.visible = false;

					}

				}

				if ( handle.name === 'XY' ) {

					if ( Math.abs( _alignVector.copy( _unitZ ).applyQuaternion( quaternion ).dot( this.eye ) ) < PLANE_HIDE_THRESHOLD ) {

						handle.scale.set( 1e-10, 1e-10, 1e-10 );
						handle.visible = false;

					}

				}

				if ( handle.name === 'YZ' ) {

					if ( Math.abs( _alignVector.copy( _unitX ).applyQuaternion( quaternion ).dot( this.eye ) ) < PLANE_HIDE_THRESHOLD ) {

						handle.scale.set( 1e-10, 1e-10, 1e-10 );
						handle.visible = false;

					}

				}

				if ( handle.name === 'XZ' ) {

					if ( Math.abs( _alignVector.copy( _unitY ).applyQuaternion( quaternion ).dot( this.eye ) ) < PLANE_HIDE_THRESHOLD ) {

						handle.scale.set( 1e-10, 1e-10, 1e-10 );
						handle.visible = false;

					}

				}

			} else if ( this.mode === 'rotate' ) {

				// Align handles to current local or world rotation

				_tempQuaternion2.copy( quaternion );
				_alignVector.copy( this.eye ).applyQuaternion( _tempQuaternion.copy( quaternion ).invert() );

				if ( handle.name.search( 'E' ) !== - 1 ) {

					handle.quaternion.setFromRotationMatrix( _lookAtMatrix.lookAt( this.eye, _zeroVector, _unitY ) );

				}

				if ( handle.name === 'X' ) {

					_tempQuaternion.setFromAxisAngle( _unitX, Math.atan2( - _alignVector.y, _alignVector.z ) );
					_tempQuaternion.multiplyQuaternions( _tempQuaternion2, _tempQuaternion );
					handle.quaternion.copy( _tempQuaternion );

				}

				if ( handle.name === 'Y' ) {

					_tempQuaternion.setFromAxisAngle( _unitY, Math.atan2( _alignVector.x, _alignVector.z ) );
					_tempQuaternion.multiplyQuaternions( _tempQuaternion2, _tempQuaternion );
					handle.quaternion.copy( _tempQuaternion );

				}

				if ( handle.name === 'Z' ) {

					_tempQuaternion.setFromAxisAngle( _unitZ, Math.atan2( _alignVector.y, _alignVector.x ) );
					_tempQuaternion.multiplyQuaternions( _tempQuaternion2, _tempQuaternion );
					handle.quaternion.copy( _tempQuaternion );

				}

			}

			// Hide disabled axes
			handle.visible = handle.visible && ( handle.name.indexOf( 'X' ) === - 1 || this.showX );
			handle.visible = handle.visible && ( handle.name.indexOf( 'Y' ) === - 1 || this.showY );
			handle.visible = handle.visible && ( handle.name.indexOf( 'Z' ) === - 1 || this.showZ );
			handle.visible = handle.visible && ( handle.name.indexOf( 'E' ) === - 1 || ( this.showX && this.showY && this.showZ ) );

			// highlight selected axis

			handle.material._color = handle.material._color || handle.material.color.clone();
			handle.material._opacity = handle.material._opacity || handle.material.opacity;

			handle.material.color.copy( handle.material._color );
			handle.material.opacity = handle.material._opacity;

			if ( this.enabled && this.axis ) {

				if ( handle.name === this.axis ) {

					handle.material.color.setHex( 0xffff00 );
					handle.material.opacity = 1.0;

				} else if ( this.axis.split( '' ).some( function ( a ) {

					return handle.name === a;

				} ) ) {

					handle.material.color.setHex( 0xffff00 );
					handle.material.opacity = 1.0;

				}

			}

		}

		super.updateMatrixWorld( force );

	}

}

//

class TransformControlsPlane extends Mesh {

	constructor() {

		super(
			new PlaneGeometry( 100000, 100000, 2, 2 ),
			new MeshBasicMaterial( { visible: false, wireframe: true, side: DoubleSide, transparent: true, opacity: 0.1, toneMapped: false } )
		);

		this.isTransformControlsPlane = true;

		this.type = 'TransformControlsPlane';

	}

	updateMatrixWorld( force ) {

		let space = this.space;

		this.position.copy( this.worldPosition );

		if ( this.mode === 'scale' ) space = 'local'; // scale always oriented to local rotation

		_v1.copy( _unitX ).applyQuaternion( space === 'local' ? this.worldQuaternion : _identityQuaternion );
		_v2.copy( _unitY ).applyQuaternion( space === 'local' ? this.worldQuaternion : _identityQuaternion );
		_v3.copy( _unitZ ).applyQuaternion( space === 'local' ? this.worldQuaternion : _identityQuaternion );

		// Align the plane for current transform mode, axis and space.

		_alignVector.copy( _v2 );

		switch ( this.mode ) {

			case 'translate':
			case 'scale':
				switch ( this.axis ) {

					case 'X':
						_alignVector.copy( this.eye ).cross( _v1 );
						_dirVector.copy( _v1 ).cross( _alignVector );
						break;
					case 'Y':
						_alignVector.copy( this.eye ).cross( _v2 );
						_dirVector.copy( _v2 ).cross( _alignVector );
						break;
					case 'Z':
						_alignVector.copy( this.eye ).cross( _v3 );
						_dirVector.copy( _v3 ).cross( _alignVector );
						break;
					case 'XY':
						_dirVector.copy( _v3 );
						break;
					case 'YZ':
						_dirVector.copy( _v1 );
						break;
					case 'XZ':
						_alignVector.copy( _v3 );
						_dirVector.copy( _v2 );
						break;
					case 'XYZ':
					case 'E':
						_dirVector.set( 0, 0, 0 );
						break;

				}

				break;
			case 'rotate':
			default:
				// special case for rotate
				_dirVector.set( 0, 0, 0 );

		}

		if ( _dirVector.length() === 0 ) {

			// If in rotate mode, make the plane parallel to camera
			this.quaternion.copy( this.cameraQuaternion );

		} else {

			_tempMatrix.lookAt( _tempVector.set( 0, 0, 0 ), _dirVector, _alignVector );

			this.quaternion.setFromRotationMatrix( _tempMatrix );

		}

		super.updateMatrixWorld( force );

	}

}

window.TransformControls = TransformControls;
})();

(() => {
const OrbitControls = window.OrbitControls;
const TransformControls = window.TransformControls;

// Purpose: shared standalone index state, scene bootstrapping, and DOM cache.

function buttonVariants(options = {}) {
  const variant = options.variant ?? 'secondary';
  const size = options.size ?? 'md';
  const fill = options.fill === true;
  const base = 'btn focus-ring';
  const variants = {
    default: 'btn-primary hover-primary',
    secondary: 'btn-secondary hover-muted',
    destructive: 'bg-destructive text-white hover-destructive',
    disabled: 'bordered bg-secondary-muted text-muted-foreground cursor-not-allowed disabled'
  };
  const sizes = {
    sm: 'btn-sm',
    md: '',
    lg: 'h-9 px-4 text-sm'
  };
  return [base, variants[variant] ?? variants.secondary, sizes[size] ?? sizes.md, fill ? 'w-full' : '']
    .filter(Boolean)
    .join(' ');
}

function clampEffectValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundEffectTime(value) {
  return Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
}

function normalizeHexColor(value, fallback) {
  const source = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const match = source.match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function normalizeAnimationEffects(data) {
  if (!data || typeof data.preset !== 'string') return null;

  const startTime = Math.max(0, Number.parseFloat(data.startTime) || 0);
  const peakTime = Math.max(startTime + 0.1, Number.parseFloat(data.peakTime) || startTime + 1.8);
  const endTime = Math.max(peakTime + 0.1, Number.parseFloat(data.endTime) || peakTime + 1.6);

  if (data.preset === 'arcane-summon') {
    return {
      preset: 'arcane-summon',
      targetCharacter: Math.max(0, Number.parseInt(data.targetCharacter, 10) || 0),
      startTime: roundEffectTime(startTime),
      peakTime: roundEffectTime(peakTime),
      endTime: roundEffectTime(endTime),
      radius: clampEffectValue(Number.parseFloat(data.radius) || 3.2, 1.5, 6),
      columnHeight: clampEffectValue(Number.parseFloat(data.columnHeight) || 6.2, 2.5, 10),
      primaryColor: normalizeHexColor(data.primaryColor, '#63f3ff'),
      secondaryColor: normalizeHexColor(data.secondaryColor, '#5b36ff'),
      accentColor: normalizeHexColor(data.accentColor, '#ffd36b'),
      glowColor: normalizeHexColor(data.glowColor, '#f0f9ff')
    };
  }

  if (data.preset === 'blade-storm') {
    return {
      preset: 'blade-storm',
      targetCharacter: Math.max(0, Number.parseInt(data.targetCharacter, 10) || 0),
      weaponId: Math.max(0, Number.parseInt(data.weaponId, 10) || 0),
      anchorJoint: String(data.anchorJoint || 'Right_Lower_Arm_0').trim() || 'Right_Lower_Arm_0',
      startTime: roundEffectTime(startTime),
      peakTime: roundEffectTime(peakTime),
      endTime: roundEffectTime(endTime),
      bladeLength: clampEffectValue(Number.parseFloat(data.bladeLength) || 2.8, 0.8, 5.5),
      trailLength: clampEffectValue(Number.parseInt(data.trailLength, 10) || 24, 8, 48),
      trailWidth: clampEffectValue(Number.parseFloat(data.trailWidth) || 0.52, 0.16, 1.35),
      shockwaveRadius: clampEffectValue(Number.parseFloat(data.shockwaveRadius) || 3.4, 1.2, 6.5),
      sparkCount: clampEffectValue(Number.parseInt(data.sparkCount, 10) || 96, 24, 180),
      primaryColor: normalizeHexColor(data.primaryColor, '#67f8ff'),
      secondaryColor: normalizeHexColor(data.secondaryColor, '#8b5cff'),
      accentColor: normalizeHexColor(data.accentColor, '#fff06a'),
      glowColor: normalizeHexColor(data.glowColor, '#f7fbff')
    };
  }

  return null;
}

// --- Core Variables ---
let camera, scene, renderer;
let orbitControls, transformControl;
const interactables = []; 
let characters = [];
let referenceCubes = [];
let weapons = [];
let selectedReferenceCube = null;
let selectedWeapon = null;
let nextReferenceCubeId = 1;
let nextWeaponId = 1;
let selectedMesh = null;
let selectedJoint = null;
let lastSelectedJoint = null;
let translationHandle = null;
const pullDragState = {
    active: false,
    characterRoot: null,
    jointChain: []
};
const tempSelectedJointWorldPosition = new THREE.Vector3();
const tempHandleWorldPosition = new THREE.Vector3();
const tempPullDelta = new THREE.Vector3();
const tempPullResidual = new THREE.Vector3();
const tempAncestorWorldPosition = new THREE.Vector3();
const tempCurrentDirection = new THREE.Vector3();
const tempTargetDirection = new THREE.Vector3();
const tempWorldAxis = new THREE.Vector3();
const tempParentWorldQuaternion = new THREE.Quaternion();
const tempParentWorldQuaternionInverse = new THREE.Quaternion();
const tempWorldDeltaQuaternion = new THREE.Quaternion();
const tempLocalDeltaQuaternion = new THREE.Quaternion();
const tempAnchorDirection = new THREE.Vector3();
const tempAnchorBaseDirection = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Animation Variables
const ui = {};
const keyframes = [];
let selectedKeyframeId = null;
let currentTime = 0;
let isPlaying = false;
let playbackSpeed = 1;
const clipRange = { start: 0, end: 0 };
let nextKeyframeId = 1;
let pointerState = null;
const KEYFRAME_TIME_STEP = 0.1;
const KEYFRAME_SNAP_TOLERANCE = 0.15;
const MIN_KEYFRAME_GAP = 0.1;
const TIMELINE_MIN_DURATION = 4;
const PLAY_ICON = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg> Play`;
const STOP_ICON = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg> Stop`;
const MODE_ACTIVE_BUTTON_CLASS = `${buttonVariants({ variant: 'secondary', size: 'md' })} flex-1`;
const MODE_INACTIVE_BUTTON_CLASS = `${buttonVariants({ variant: 'secondary', size: 'md' })} flex-1`;
const TIMELINE_ACTION_BUTTON_CLASS = 'timeline-action-button';
const PLAY_BUTTON_CLASS = `${buttonVariants({ variant: 'secondary', size: 'md' })} ${TIMELINE_ACTION_BUTTON_CLASS}`;
const STOP_BUTTON_CLASS = `${buttonVariants({ variant: 'secondary', size: 'md' })} ${TIMELINE_ACTION_BUTTON_CLASS}`;
const CLIP_BUTTON_CLASS = `${buttonVariants({ variant: 'secondary', size: 'md' })} ${TIMELINE_ACTION_BUTTON_CLASS}`;
const CLIP_DISABLED_BUTTON_CLASS = `${buttonVariants({ variant: 'disabled', size: 'md' })} ${TIMELINE_ACTION_BUTTON_CLASS}`;
let timelineViewDuration = TIMELINE_MIN_DURATION;
const clock = new THREE.Clock();
const ASSET_FORMAT = 'fast-poser-asset';
const ASSET_VERSION = 1;
const REFERENCE_CUBE_MIN_SIZE = 0.1;
const REFERENCE_CUBE_MAX_SIZE = 40;
const WEAPON_MIN_SIZE = 0.05;
const WEAPON_MAX_SIZE = 40;
const WEAPON_DEFAULT_DIMENSIONS = { width: 0.16, length: 1.65, depth: 0.16 };
const WEAPON_DEFAULT_COLOR = '#d4d4d8';
const STORAGE_KEYS = {
    pose: 'fast-poser:pose-library',
    animation: 'fast-poser:animation-library'
};
const MOTION_CAPTURE_TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21-rc.20250105/vision_bundle.mjs';
const MOTION_CAPTURE_WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21-rc.20250105/wasm';
const MOTION_CAPTURE_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const MOTION_CAPTURE_SMOOTHING = 0.55;
const MOTION_CAPTURE_VISIBILITY = 0.24;
const MOTION_CAPTURE_ROOT_Y_MIN = 1.1;
const MOTION_CAPTURE_ROOT_Y_MAX = 6.4;
const MOTION_CAPTURE_ROOT_XZ_LIMIT = 4.5;
const MOTION_CAPTURE_ROOT_Z_LIMIT = 3.25;
const MOTION_CAPTURE_DOWN_AXIS = new THREE.Vector3(0, -1, 0);
const MOTION_CAPTURE_BASE_JOINT_ORDER = [
    'Hips',
    'Spine',
    'Head',
    'Left_Upper_Arm',
    'Left_Lower_Arm',
    'Right_Upper_Arm',
    'Right_Lower_Arm',
    'Left_Upper_Leg',
    'Left_Lower_Leg',
    'Right_Upper_Leg',
    'Right_Lower_Leg'
];
const MOTION_CAPTURE_BASE_JOINT_PARENTS = {
    Hips: null,
    Spine: 'Hips',
    Head: 'Spine',
    Left_Upper_Arm: 'Spine',
    Left_Lower_Arm: 'Left_Upper_Arm',
    Right_Upper_Arm: 'Spine',
    Right_Lower_Arm: 'Right_Upper_Arm',
    Left_Upper_Leg: 'Hips',
    Left_Lower_Leg: 'Left_Upper_Leg',
    Right_Upper_Leg: 'Hips',
    Right_Lower_Leg: 'Right_Upper_Leg'
};
const MOTION_CAPTURE_CONNECTIONS = [
    [11, 12],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28]
];
const MOTION_CAPTURE_LM = {
    NOSE: 0,
    LEFT_EAR: 7,
    RIGHT_EAR: 8,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
    LEFT_KNEE: 25,
    RIGHT_KNEE: 26,
    LEFT_ANKLE: 27,
    RIGHT_ANKLE: 28
};
const libraries = {
    pose: [],
    animation: []
};
let libraryStorageUnavailable = false;
let activeAnimationEffects = null;
let summonVfx = null;
let slashVfx = null;
const effectAnchorPosition = new THREE.Vector3();
const slashBladeBase = new THREE.Vector3();
const slashBladeTip = new THREE.Vector3();
const slashBladeMid = new THREE.Vector3();
const slashBladeDirection = new THREE.Vector3();
const slashTrailTangent = new THREE.Vector3();
const slashTrailSide = new THREE.Vector3();
const slashTrailView = new THREE.Vector3();
const slashSparkSide = new THREE.Vector3();
const slashSparkLift = new THREE.Vector3();
const slashTempPoint = new THREE.Vector3();
const slashTempPrev = new THREE.Vector3();
const slashTempNext = new THREE.Vector3();
const slashBladeQuaternion = new THREE.Quaternion();
const slashFallbackAxis = new THREE.Vector3(1, 0, 0);
const motionCapture = {
    importsPromise: null,
    FilesetResolver: null,
    PoseLandmarker: null,
    poseLandmarker: null,
    stream: null,
    objectUrl: '',
    activeSource: 'none',
    animationFrameId: 0,
    processing: false,
    lastProcessedVideoTime: -1,
    latestLandmarks: [],
    basePose: null,
    currentPose: null,
    rootBaseline: null,
    sourceLabel: '',
    isRecording: false,
    recordStartTime: 0,
    screenTimelinePreview: false,
    syncingFromVideo: false,
    videoSeekingFromTimeline: false,
    dragPointerId: null,
    dragOffsetX: 0,
    dragOffsetY: 0
};

function init() {
    const container = document.getElementById( 'canvas-container' );
    cacheUi();

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color( 0x1a1a1a );
    scene.fog = new THREE.Fog( 0x1a1a1a, 10, 50 );

    // Camera setup
    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 100 );
    camera.position.set( 0, 5, 12 );

    // Renderer setup
    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild( renderer.domElement );

    // Lights
    const ambientLight = new THREE.AmbientLight( 0xffffff, 0.6 );
    scene.add( ambientLight );

    const dirLight = new THREE.DirectionalLight( 0xffffff, 1.5 );
    dirLight.position.set( 5, 10, 5 );
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add( dirLight );

    const backLight = new THREE.DirectionalLight( 0x90b0ff, 0.8 );
    backLight.position.set( -5, 5, -5 );
    scene.add( backLight );

    // Environment (Floor & Grid)
    const grid = new THREE.GridHelper( 40, 40, 0x444444, 0x222222 );
    grid.position.y = 0;
    scene.add( grid );

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const floor = new THREE.Mesh( new THREE.PlaneGeometry( 100, 100 ), floorMat );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add( floor );

    summonVfx = createSummonVfxRig();
    scene.add(summonVfx.group);
    slashVfx = createBladeStormVfxRig();
    scene.add(slashVfx.group);

    // Controls
    orbitControls = new OrbitControls( camera, renderer.domElement );
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below floor

    transformControl = new TransformControls( camera, renderer.domElement );
    translationHandle = new THREE.Group();
    translationHandle.name = '__pull_handle__';
    scene.add( translationHandle );
    transformControl.addEventListener( 'dragging-changed', function ( event ) {
        orbitControls.enabled = ! event.value; // Disable camera orbit while posing
        if ( !event.value ) {
            endPullDrag();
        }
    });
    transformControl.addEventListener( 'mouseDown', beginPullDrag );
    transformControl.addEventListener( 'mouseUp', endPullDrag );
    transformControl.addEventListener( 'objectChange', handleTransformObjectChange );
    transformControl.setMode('rotate');
    transformControl.setSpace('local');
    scene.add( transformControl );

    // Events
    window.addEventListener( 'resize', onWindowResize );
    
    // Interaction logic (Pointer down for selection)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;

        // Let TransformControls consume gizmo drags without the picker deselecting the joint.
        if (isTransformControlAxisActive()) return;

        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        mouse.x = ( (event.clientX - rect.left) / rect.width ) * 2 - 1;
        mouse.y = - ( (event.clientY - rect.top) / rect.height ) * 2 + 1;

        raycaster.setFromCamera( mouse, camera );
        const intersects = raycaster.intersectObjects( interactables, false );

        if ( intersects.length > 0 ) {
            selectInteractable(intersects[0].object);
        } else {
            deselect();
        }
    });

    // UI Listeners
    ui.addBtn.addEventListener('click', () => {
        createCharacter();
    });

    ui.addCubeBtn.addEventListener('click', () => {
        createReferenceCube();
    });

    ui.addWeaponBtn.addEventListener('click', () => {
        createWeapon();
    });

    ui.clearBtn.addEventListener('click', () => {
        clearSceneCharacters();
        clearReferenceCubes();
        clearWeapons();
        clearKeyframes();
    });

    ui.modeRotateBtn.addEventListener('click', () => setMode('rotate'));
    ui.modeTranslateBtn.addEventListener('click', () => setMode('translate'));
    ui.deleteCubeBtn.addEventListener('click', deleteSelectedReferenceCube);
    ui.deleteWeaponBtn.addEventListener('click', deleteSelectedWeapon);
    ui.anchorWeaponBtn.addEventListener('click', anchorSelectedWeaponFromControls);
    ui.deanchorWeaponBtn.addEventListener('click', deanchorSelectedWeapon);
    [
        ui.cubeWidthInput,
        ui.cubeHeightInput,
        ui.cubeDepthInput
    ].forEach(input => {
        input.addEventListener('input', handleReferenceCubeDimensionInput);
        input.addEventListener('change', () => {
            handleReferenceCubeDimensionInput();
            syncReferenceCubeControls();
        });
    });
    [
        ui.weaponWidthInput,
        ui.weaponLengthInput,
        ui.weaponDepthInput
    ].forEach(input => {
        input.addEventListener('input', handleWeaponDimensionInput);
        input.addEventListener('change', () => {
            handleWeaponDimensionInput();
            syncWeaponControls();
        });
    });
    [
        ui.actorWidthInput,
        ui.actorHeightInput,
        ui.actorDepthInput
    ].forEach(input => {
        input.addEventListener('input', handleActorDimensionInput);
        input.addEventListener('change', () => {
            handleActorDimensionInput();
            syncActorDimensionControls();
        });
    });

    // Animation UI Listeners
    ui.addKeyframeBtn.addEventListener('click', recordKeyframeAtCurrentTime);
    ui.deleteKeyframeBtn.addEventListener('click', deleteSelectedKeyframe);
    ui.playBtn.addEventListener('click', togglePlay);
    ui.clipAnimationBtn.addEventListener('click', clipAnimationToSelection);
    ui.clearKeyframesBtn.addEventListener('click', clearKeyframes);
    ui.timeInput.addEventListener('change', commitTimeInput);
    ui.timeInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            commitTimeInput();
            ui.timeInput.blur();
        }
    });
    ui.speedSlider.addEventListener('input', () => {
        playbackSpeed = Number.parseFloat(ui.speedSlider.value) || 1;
        refreshTimelineUi();
    });
    ui.timelineTrack.addEventListener('pointerdown', handleTimelinePointerDown);
    ui.timelineClipStart.addEventListener('pointerdown', (event) => handleClipHandlePointerDown(event, 'start'));
    ui.timelineClipEnd.addEventListener('pointerdown', (event) => handleClipHandlePointerDown(event, 'end'));
    ui.poseLibrary.addEventListener('change', () => syncSelectedAssetName('pose'));
    ui.animationLibrary.addEventListener('change', () => syncSelectedAssetName('animation'));
    ui.savePoseBtn.addEventListener('click', saveCurrentPoseToLibrary);
    ui.applyPoseBtn.addEventListener('click', applySelectedPoseFromLibrary);
    ui.exportPoseBtn.addEventListener('click', exportSelectedPose);
    ui.importPoseBtn.addEventListener('click', () => ui.poseImportInput.click());
    ui.deletePoseBtn.addEventListener('click', () => deleteSelectedAsset('pose'));
    ui.saveAnimationBtn.addEventListener('click', saveCurrentAnimationToLibrary);
    ui.loadAnimationBtn.addEventListener('click', loadSelectedAnimationFromLibrary);
    ui.exportAnimationBtn.addEventListener('click', exportSelectedAnimation);
    ui.importAnimationBtn.addEventListener('click', () => ui.animationImportInput.click());
    ui.deleteAnimationBtn.addEventListener('click', () => deleteSelectedAsset('animation'));
    ui.motionCaptureUploadBtn.addEventListener('click', () => ui.motionCaptureVideoInput.click());
    ui.motionCaptureScreenBtn.addEventListener('click', startMotionCaptureScreenShare);
    ui.poseImportInput.addEventListener('change', (event) => handleAssetImport(event, 'pose'));
    ui.animationImportInput.addEventListener('change', (event) => handleAssetImport(event, 'animation'));
    ui.motionCaptureVideoInput.addEventListener('change', handleMotionCaptureVideoSelected);
    ui.motionCaptureVideo.addEventListener('loadedmetadata', handleMotionCaptureVideoMetadataLoaded);
    ui.motionCaptureVideo.addEventListener('play', handleMotionCaptureVideoPlay);
    ui.motionCaptureVideo.addEventListener('pause', handleMotionCaptureVideoPause);
    ui.motionCaptureVideo.addEventListener('ended', handleMotionCaptureVideoEnded);
    ui.motionCaptureVideo.addEventListener('seeked', handleMotionCaptureVideoSeeked);
    ui.motionCaptureVideo.addEventListener('timeupdate', syncMotionCaptureTransportUi);
    ui.motionCaptureVideo.addEventListener('emptied', clearMotionCaptureOverlay);
    ui.motionCaptureRecordBtn.addEventListener('click', toggleMotionCaptureRecording);
    ui.motionCapturePlayBtn.addEventListener('click', toggleMotionCaptureVideoPlayback);
    ui.motionCaptureStopBtn.addEventListener('click', stopMotionCaptureFromUi);
    ui.motionCaptureScrub.addEventListener('input', handleMotionCaptureScrubInput);
    ui.motionCaptureHeader.addEventListener('pointerdown', beginMotionCapturePanelDrag);
    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    // Keybindings
    window.addEventListener('keydown', (event) => {
        const activeTag = document.activeElement?.tagName;
        const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

        if (event.key.toLowerCase() === 'r') setMode('rotate');
        if (event.key.toLowerCase() === 't') setMode('translate');
        if (event.key === 'Escape') deselect();
        if (!isTyping && event.key === ' ') {
            event.preventDefault();
            togglePlay();
        }
        if (!isTyping && (event.key === 'Delete' || event.key === 'Backspace')) {
            if (selectedReferenceCube) {
                deleteSelectedReferenceCube();
            } else if (selectedWeapon) {
                deleteSelectedWeapon();
            } else {
                deleteSelectedKeyframe();
            }
        }
    });

            loadLibrariesFromStorage();
            installLocalAssetHotReload();

            // Add first character
            createCharacter();
    refreshTimelineUi();
}

function cacheUi() {
    ui.addBtn = document.getElementById('add-btn');
    ui.addCubeBtn = document.getElementById('add-cube-btn');
    ui.addWeaponBtn = document.getElementById('add-weapon-btn');
    ui.clearBtn = document.getElementById('clear-btn');
    ui.modeRotateBtn = document.getElementById('mode-rotate');
    ui.modeTranslateBtn = document.getElementById('mode-translate');
    ui.referenceCubePanel = document.getElementById('reference-cube-panel');
    ui.cubeWidthInput = document.getElementById('cube-width-input');
    ui.cubeHeightInput = document.getElementById('cube-height-input');
    ui.cubeDepthInput = document.getElementById('cube-depth-input');
    ui.deleteCubeBtn = document.getElementById('delete-cube-btn');
    ui.weaponPanel = document.getElementById('weapon-panel');
    ui.weaponWidthInput = document.getElementById('weapon-width-input');
    ui.weaponLengthInput = document.getElementById('weapon-length-input');
    ui.weaponDepthInput = document.getElementById('weapon-depth-input');
    ui.weaponAnchorSelect = document.getElementById('weapon-anchor-select');
    ui.weaponAnchorPoint = document.getElementById('weapon-anchor-point');
    ui.anchorWeaponBtn = document.getElementById('anchor-weapon-btn');
    ui.deanchorWeaponBtn = document.getElementById('deanchor-weapon-btn');
    ui.deleteWeaponBtn = document.getElementById('delete-weapon-btn');
    ui.weaponAnchorLabel = document.getElementById('weapon-anchor-label');
    ui.actorSizePanel = document.getElementById('actor-size-panel');
    ui.actorSizeName = document.getElementById('actor-size-name');
    ui.actorWidthInput = document.getElementById('actor-width-input');
    ui.actorHeightInput = document.getElementById('actor-height-input');
    ui.actorDepthInput = document.getElementById('actor-depth-input');
    ui.selectionInfo = document.getElementById('selection-info');
    ui.selectedName = document.getElementById('selected-name');
    ui.addKeyframeBtn = document.getElementById('add-kf-btn');
    ui.deleteKeyframeBtn = document.getElementById('delete-kf-btn');
    ui.playBtn = document.getElementById('play-btn');
    ui.clipAnimationBtn = document.getElementById('clip-animation-btn');
    ui.clearKeyframesBtn = document.getElementById('clear-kf-btn');
    ui.keyframeCount = document.getElementById('kf-count');
    ui.selectedFrame = document.getElementById('selected-frame');
    ui.animationLength = document.getElementById('anim-length');
    ui.timeInput = document.getElementById('time-input');
    ui.speedSlider = document.getElementById('speed-slider');
    ui.speedValue = document.getElementById('speed-value');
    ui.timelineTrack = document.getElementById('timeline-track');
    ui.timelineWorkarea = document.getElementById('timeline-workarea');
    ui.timelineFill = document.getElementById('timeline-fill');
    ui.timelineKeyframes = document.getElementById('timeline-keyframes');
    ui.timelinePlayhead = document.getElementById('timeline-playhead');
    ui.timelineClipBefore = document.getElementById('timeline-clip-before');
    ui.timelineClipRange = document.getElementById('timeline-clip-range');
    ui.timelineClipAfter = document.getElementById('timeline-clip-after');
    ui.timelineClipStart = document.getElementById('timeline-clip-start');
    ui.timelineClipEnd = document.getElementById('timeline-clip-end');
    ui.timelineEndLabel = document.getElementById('timeline-end-label');
    ui.poseNameInput = document.getElementById('pose-name-input');
    ui.poseLibrary = document.getElementById('pose-library');
    ui.savePoseBtn = document.getElementById('save-pose-btn');
    ui.applyPoseBtn = document.getElementById('apply-pose-btn');
    ui.exportPoseBtn = document.getElementById('export-pose-btn');
    ui.importPoseBtn = document.getElementById('import-pose-btn');
    ui.deletePoseBtn = document.getElementById('delete-pose-btn');
    ui.animationNameInput = document.getElementById('animation-name-input');
    ui.animationLibrary = document.getElementById('animation-library');
    ui.saveAnimationBtn = document.getElementById('save-animation-btn');
    ui.loadAnimationBtn = document.getElementById('load-animation-btn');
    ui.exportAnimationBtn = document.getElementById('export-animation-btn');
    ui.importAnimationBtn = document.getElementById('import-animation-btn');
    ui.deleteAnimationBtn = document.getElementById('delete-animation-btn');
    ui.motionCaptureUploadBtn = document.getElementById('motion-capture-upload-btn');
    ui.motionCaptureScreenBtn = document.getElementById('motion-capture-screen-btn');
    ui.assetStatus = document.getElementById('asset-status');
    ui.motionCapturePreview = document.getElementById('motion-capture-preview');
    ui.motionCaptureHeader = document.getElementById('motion-capture-header');
    ui.motionCaptureLabel = document.getElementById('motion-capture-label');
    ui.motionCaptureState = document.getElementById('motion-capture-state');
    ui.motionCaptureVideo = document.getElementById('motion-capture-video');
    ui.motionCaptureOverlay = document.getElementById('motion-capture-overlay');
    ui.motionCaptureRecordBtn = document.getElementById('motion-capture-record-btn');
    ui.motionCapturePlayBtn = document.getElementById('motion-capture-play-btn');
    ui.motionCaptureStopBtn = document.getElementById('motion-capture-stop-btn');
    ui.motionCaptureScrub = document.getElementById('motion-capture-scrub');
    ui.motionCaptureTime = document.getElementById('motion-capture-time');
    ui.motionCaptureVideoInput = document.getElementById('motion-capture-video-input');
    ui.poseImportInput = document.getElementById('pose-import-input');
    ui.animationImportInput = document.getElementById('animation-import-input');
}

// --- Logic & Systems ---

// Purpose: asset persistence, import/export, and data normalization.

function loadLibrariesFromStorage() {
    libraries.pose = readLibraryFromStorage('pose');
    libraries.animation = readLibraryFromStorage('animation');
    refreshAssetLibraryUi('pose');
    refreshAssetLibraryUi('animation');
    setStatus(
        libraryStorageUnavailable
            ? 'Browser storage is unavailable here, but you can still export and import JSON files.'
            : 'Reusable poses and animations are ready. Export/import uses JSON files.',
        libraryStorageUnavailable ? 'error' : 'info'
    );
}

function readLibraryFromStorage(type) {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEYS[type]);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn(`Unable to read ${type} library`, error);
        libraryStorageUnavailable = true;
        return [];
    }
}

function persistLibrary(type) {
    try {
        window.localStorage.setItem(STORAGE_KEYS[type], JSON.stringify(libraries[type]));
        return true;
    } catch (error) {
        console.warn(`Unable to persist ${type} library`, error);
        libraryStorageUnavailable = true;
        setStatus('Could not write to browser storage. Your asset is still available for this session.', 'error');
        return false;
    }
}

function refreshAssetLibraryUi(type) {
    const select = type === 'pose' ? ui.poseLibrary : ui.animationLibrary;
    const input = type === 'pose' ? ui.poseNameInput : ui.animationNameInput;
    const label = type === 'pose' ? 'saved poses' : 'saved animations';
    const previousValue = select.value || input.value.trim();

    select.innerHTML = '';

    if (libraries[type].length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.textContent = `No ${label} yet`;
        emptyOption.disabled = true;
        emptyOption.selected = true;
        select.appendChild(emptyOption);
        if (!input.matches(':focus')) {
            input.value = '';
        }
        return;
    }

    libraries[type].forEach(asset => {
        const option = document.createElement('option');
        option.value = asset.name;
        const count = getAssetCharacterCount(asset);
        const countLabel = `${count} actor${count === 1 ? '' : 's'}`;
        option.textContent = `${asset.name} (${countLabel})`;
        select.appendChild(option);
    });

    const nextValue = libraries[type].some(asset => asset.name === previousValue)
        ? previousValue
        : libraries[type][0].name;

    select.value = nextValue;
    if (!input.matches(':focus')) {
        input.value = nextValue;
    }
}

function syncSelectedAssetName(type) {
    const select = type === 'pose' ? ui.poseLibrary : ui.animationLibrary;
    const input = type === 'pose' ? ui.poseNameInput : ui.animationNameInput;
    if (select.selectedOptions.length === 0 || select.selectedOptions[0].disabled) return;
    input.value = select.value;
}

function getSelectedAsset(type) {
    const select = type === 'pose' ? ui.poseLibrary : ui.animationLibrary;
    if (!select.value) return null;
    return libraries[type].find(asset => asset.name === select.value) ?? null;
}

function getAssetNameInput(type) {
    const input = type === 'pose' ? ui.poseNameInput : ui.animationNameInput;
    const explicitName = input.value.trim();

    if (explicitName) {
        return explicitName;
    }

    const base = type === 'pose' ? 'Pose' : 'Animation';
    const existing = new Set(libraries[type].map(asset => asset.name.toLowerCase()));
    let index = 1;
    let generated = `${base} ${index}`;
    while (existing.has(generated.toLowerCase())) {
        index += 1;
        generated = `${base} ${index}`;
    }

    input.value = generated;
    return generated;
}

function setStatus(message, tone = 'info') {
    const toneClasses = {
        info: 'status-text',
        success: 'status-text status-success',
        error: 'status-text status-error'
    };

    ui.assetStatus.className = toneClasses[tone] ?? toneClasses.info;
    ui.assetStatus.textContent = message;
}

function saveAssetToLibrary(type, asset) {
    const existingIndex = libraries[type].findIndex(entry => entry.name.toLowerCase() === asset.name.toLowerCase());
    if (existingIndex >= 0) {
        libraries[type].splice(existingIndex, 1);
    }

    libraries[type].unshift(asset);
    persistLibrary(type);
    refreshAssetLibraryUi(type);
    syncSelectedAssetName(type);
}

function deleteSelectedAsset(type) {
    const asset = getSelectedAsset(type);
    if (!asset) {
        setStatus(`Select a ${type} to delete.`, 'error');
        return;
    }

    libraries[type] = libraries[type].filter(entry => entry.name !== asset.name);
    persistLibrary(type);
    refreshAssetLibraryUi(type);
    setStatus(`${type === 'pose' ? 'Pose' : 'Animation'} "${asset.name}" deleted.`, 'success');
}

function saveCurrentPoseToLibrary() {
    if (characters.length === 0) {
        setStatus('Add a character before saving a pose.', 'error');
        return;
    }

    const name = getAssetNameInput('pose');
    saveAssetToLibrary('pose', createPoseAsset(name));
    setStatus(`Pose "${name}" saved for reuse.`, 'success');
}

function saveCurrentAnimationToLibrary() {
    if (keyframes.length === 0) {
        setStatus('Record at least one keyframe before saving an animation.', 'error');
        return;
    }

    const name = getAssetNameInput('animation');
    saveAssetToLibrary('animation', createAnimationAsset(name));
    setStatus(`Animation "${name}" saved and can be loaded again anytime.`, 'success');
}

function applySelectedPoseFromLibrary() {
    const asset = getSelectedAsset('pose');
    if (!asset) {
        setStatus('Select a pose to apply.', 'error');
        return;
    }

    applyPoseAsset(asset);
}

function loadSelectedAnimationFromLibrary() {
    const asset = getSelectedAsset('animation');
    if (!asset) {
        setStatus('Select an animation to load.', 'error');
        return;
    }

    loadAnimationAsset(asset);
}

function exportSelectedPose() {
    const asset = getSelectedAsset('pose');
    if (!asset) {
        setStatus('Select a pose to export.', 'error');
        return;
    }

    downloadAssetFile(asset);
    setStatus(`Pose "${asset.name}" exported as JSON.`, 'success');
}

function exportSelectedAnimation() {
    const asset = getSelectedAsset('animation');
    if (!asset) {
        setStatus('Select an animation to export.', 'error');
        return;
    }

    downloadAssetFile(asset);
    setStatus(`Animation "${asset.name}" exported as JSON.`, 'success');
}

async function handleAssetImport(event, type) {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) return;

    try {
        await importAssetFromText(await file.text(), type, file.name);
    } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : `Unable to import ${type}.`, 'error');
    } finally {
        input.value = '';
    }
}

async function importAssetFromText(text, type, fileName) {
    const asset = normalizeImportedAsset(JSON.parse(text), type, fileName);
    saveAssetToLibrary(type, asset);

    if (type === 'pose') {
        applyPoseAsset(asset);
    } else {
        loadAnimationAsset(asset);
    }

    return asset;
}

function installLocalAssetHotReload() {
    // Hot reload is only available in the Vite source version.
}


function inferAssetType(data) {
    if (data?.type === 'pose' || data?.type === 'animation') {
        return data.type;
    }

    if (Array.isArray(data?.keyframes)) {
        return 'animation';
    }

    if (data?.pose && typeof data.pose === 'object') {
        return 'pose';
    }

    return null;
}

function createPoseAsset(name) {
    return {
        format: ASSET_FORMAT,
        version: ASSET_VERSION,
        type: 'pose',
        name,
        savedAt: new Date().toISOString(),
        scene: {
            characterCount: characters.length,
            characterColors: getCharacterColors(),
            weapons: serializeSceneWeapons()
        },
        pose: serializePose(capturePose())
    };
}

function createAnimationAsset(name) {
    return {
        format: ASSET_FORMAT,
        version: ASSET_VERSION,
        type: 'animation',
        name,
        savedAt: new Date().toISOString(),
        scene: {
            characterCount: characters.length,
            characterColors: getCharacterColors(),
            weapons: serializeSceneWeapons()
        },
        playbackSpeed,
        effects: serializeAnimationEffects(activeAnimationEffects),
        keyframes: keyframes.map(frame => ({
            time: roundTime(frame.time),
            pose: serializePose(frame.pose)
        }))
    };
}

function applyPoseAsset(asset) {
    const pose = deserializePose(asset.pose);
    if (Object.keys(pose).length === 0) {
        setStatus(`Pose "${asset.name}" has no valid joint data.`, 'error');
        return;
    }

    stopPlayback();
    pointerState = null;
    selectedKeyframeId = null;
    syncSceneToAsset(asset);
    setAnimationEffects(null);
    applyPoseState(pose);
    refreshTimelineUi();
    setStatus(`Pose "${asset.name}" applied. Record a keyframe to reuse it in an animation.`, 'success');
}

function loadAnimationAsset(asset) {
    const importedFrames = deserializeKeyframes(asset.keyframes);
    if (importedFrames.length === 0) {
        setStatus(`Animation "${asset.name}" has no valid keyframes to load.`, 'error');
        return;
    }

    stopPlayback();
    deselect();
    pointerState = null;
    syncSceneToAsset(asset);

    keyframes.length = 0;
    importedFrames.forEach(frame => keyframes.push(frame));
    selectedKeyframeId = keyframes[0]?.id ?? null;
    nextKeyframeId = keyframes.reduce((maxId, frame) => Math.max(maxId, frame.id), 0) + 1;
    playbackSpeed = THREE.MathUtils.clamp(Number.parseFloat(asset.playbackSpeed) || 1, 0.25, 2.5);
    timelineViewDuration = Math.max(TIMELINE_MIN_DURATION, roundUpTime(getAnimationEndTime() + 0.5));
    resetClipRange();
    setAnimationEffects(asset.effects);
    setCurrentTime(keyframes[0]?.time ?? 0);
    syncMotionCapturePlaybackState(true);
    setStatus(
        activeAnimationEffects
            ? `Animation "${asset.name}" loaded with arcane summon FX. You can scrub, edit, and resave it now.`
            : `Animation "${asset.name}" loaded. You can scrub, edit, and resave it now.`,
        'success'
    );
}

function serializePose(pose) {
    const serialized = {};

    Object.entries(pose || {}).forEach(([name, transform]) => {
        if (!transform?.position || !transform?.quaternion) return;
        serialized[name] = {
            position: [transform.position.x, transform.position.y, transform.position.z],
            quaternion: [
                transform.quaternion.x,
                transform.quaternion.y,
                transform.quaternion.z,
                transform.quaternion.w
            ],
            scale: transform.scale
                ? [transform.scale.x, transform.scale.y, transform.scale.z]
                : undefined
        };
    });

    return serialized;
}

function deserializePose(serializedPose) {
    const pose = {};

    Object.entries(serializedPose || {}).forEach(([name, transform]) => {
        const positionValues = Array.isArray(transform?.position) ? transform.position.slice(0, 3).map(Number) : [];
        const quaternionValues = Array.isArray(transform?.quaternion) ? transform.quaternion.slice(0, 4).map(Number) : [];
        const scaleValues = Array.isArray(transform?.scale) ? transform.scale.slice(0, 3).map(Number) : null;

        if (positionValues.length !== 3 || quaternionValues.length !== 4) return;
        if (![...positionValues, ...quaternionValues].every(Number.isFinite)) return;
        if (scaleValues && (scaleValues.length !== 3 || !scaleValues.every(Number.isFinite))) return;

        const quaternion = new THREE.Quaternion(...quaternionValues);
        if (quaternion.lengthSq() === 0) {
            quaternion.identity();
        } else {
            quaternion.normalize();
        }

        const clampScale = name.startsWith('weapon:') ? clampWeaponSize : clampReferenceCubeSize;

        pose[name] = {
            position: new THREE.Vector3(...positionValues),
            quaternion,
            scale: scaleValues
                ? new THREE.Vector3(
                    clampScale(scaleValues[0]),
                    clampScale(scaleValues[1]),
                    clampScale(scaleValues[2])
                )
                : null
        };
    });

    return pose;
}

function deserializeKeyframes(serializedFrames) {
    const uniqueFrames = new Map();

    (Array.isArray(serializedFrames) ? serializedFrames : []).forEach(frame => {
        const time = roundTime(Number.parseFloat(frame?.time));
        const pose = deserializePose(frame?.pose);

        if (!Number.isFinite(time) || time < 0 || Object.keys(pose).length === 0) return;
        uniqueFrames.set(time.toFixed(1), { time, pose });
    });

    return Array.from(uniqueFrames.values())
        .sort((a, b) => a.time - b.time)
        .map((frame, index) => ({
            id: index + 1,
            time: frame.time,
            pose: frame.pose
        }));
}

function normalizeImportedAsset(data, expectedType, fallbackFileName) {
    const inferredType = data?.type === 'pose' || data?.type === 'animation'
        ? data.type
        : Array.isArray(data?.keyframes)
            ? 'animation'
            : data?.pose && typeof data.pose === 'object'
                ? 'pose'
                : null;

    if (!inferredType) {
        throw new Error('This file is not a supported Fast Poser pose or animation.');
    }

    if (inferredType !== expectedType) {
        throw new Error(`That file contains a ${inferredType}, not a ${expectedType}.`);
    }

    const cleanedName = String(data?.name || fallbackFileName || '').replace(/\.[^.]+$/, '').trim();
    const scene = {
        characterCount: getAssetCharacterCount(data),
        characterColors: normalizeCharacterColors(data?.scene?.characterColors ?? data?.characterColors),
        weapons: normalizeSerializedWeapons(data?.scene?.weapons ?? data?.weapons)
    };

    if (inferredType === 'pose') {
        return {
            format: data?.format || ASSET_FORMAT,
            version: Number.parseInt(data?.version, 10) || ASSET_VERSION,
            type: 'pose',
            name: cleanedName || getAssetNameInput('pose'),
            savedAt: data?.savedAt || new Date().toISOString(),
            scene,
            pose: data?.pose ?? {}
        };
    }

    return {
        format: data?.format || ASSET_FORMAT,
        version: Number.parseInt(data?.version, 10) || ASSET_VERSION,
        type: 'animation',
        name: cleanedName || getAssetNameInput('animation'),
        savedAt: data?.savedAt || new Date().toISOString(),
        scene,
        playbackSpeed: THREE.MathUtils.clamp(Number.parseFloat(data?.playbackSpeed) || 1, 0.25, 2.5),
        effects: data?.effects ?? null,
        keyframes: Array.isArray(data?.keyframes) ? data.keyframes : []
    };
}

function getAssetCharacterCount(asset) {
    const explicitCount = Number.parseInt(asset?.scene?.characterCount ?? asset?.characterCount, 10);
    if (Number.isInteger(explicitCount) && explicitCount >= 0) {
        return explicitCount;
    }

    if (asset?.type === 'animation' || Array.isArray(asset?.keyframes)) {
        const maxCharacterIndex = (Array.isArray(asset?.keyframes) ? asset.keyframes : []).reduce((currentMax, frame) => {
            return Math.max(currentMax, inferCharacterIndexFromPose(frame?.pose));
        }, -1);
        return maxCharacterIndex + 1;
    }

    return inferCharacterIndexFromPose(asset?.pose) + 1;
}

function inferCharacterIndexFromPose(serializedPose) {
    return Object.keys(serializedPose || {}).reduce((currentMax, jointName) => {
        const match = jointName.match(/_(\d+)$/);
        return match ? Math.max(currentMax, Number.parseInt(match[1], 10)) : currentMax;
    }, -1);
}

function normalizeCharacterColors(values) {
    return (Array.isArray(values) ? values : [])
        .map(value => {
            try {
                return `#${new THREE.Color(value).getHexString()}`;
            } catch (error) {
                return null;
            }
        })
        .filter(Boolean);
}

function normalizeSerializedWeapons(values) {
    const seenIds = new Set();

    return (Array.isArray(values) ? values : [])
        .map((weapon, index) => {
            const id = Math.max(1, Number.parseInt(weapon?.id, 10) || index + 1);
            if (seenIds.has(id)) return null;
            seenIds.add(id);

            const dimensions = normalizeWeaponDimensions(weapon?.dimensions ?? weapon);
            const transform = normalizeTransformPayload(weapon?.transform);
            const anchor = normalizeWeaponAnchor(weapon?.anchor);
            const color = normalizeColorValue(weapon?.color, WEAPON_DEFAULT_COLOR);

            return {
                id,
                name: String(weapon?.name || `Weapon_${id}`).trim() || `Weapon_${id}`,
                dimensions,
                transform,
                anchor,
                color
            };
        })
        .filter(Boolean);
}

function normalizeWeaponDimensions(source = {}) {
    const width = Number.parseFloat(source.width);
    const length = Number.parseFloat(source.length ?? source.height);
    const depth = Number.parseFloat(source.depth);

    return {
        width: Number.isFinite(width) ? clampWeaponSize(width) : WEAPON_DEFAULT_DIMENSIONS.width,
        length: Number.isFinite(length) ? clampWeaponSize(length) : WEAPON_DEFAULT_DIMENSIONS.length,
        depth: Number.isFinite(depth) ? clampWeaponSize(depth) : WEAPON_DEFAULT_DIMENSIONS.depth
    };
}

function normalizeTransformPayload(transform) {
    const positionValues = Array.isArray(transform?.position) ? transform.position.slice(0, 3).map(Number) : null;
    const quaternionValues = Array.isArray(transform?.quaternion) ? transform.quaternion.slice(0, 4).map(Number) : null;
    const scaleValues = Array.isArray(transform?.scale) ? transform.scale.slice(0, 3).map(Number) : null;

    if (!positionValues || !quaternionValues) return null;
    if (positionValues.length !== 3 || quaternionValues.length !== 4) return null;
    if (![...positionValues, ...quaternionValues].every(Number.isFinite)) return null;
    if (scaleValues && (scaleValues.length !== 3 || !scaleValues.every(Number.isFinite))) return null;

    return {
        position: positionValues,
        quaternion: quaternionValues,
        scale: scaleValues
    };
}

function normalizeWeaponAnchor(anchor) {
    if (!anchor || typeof anchor.jointName !== 'string') return null;
    const jointName = anchor.jointName.trim();
    if (!jointName) return null;

    return {
        jointName,
        point: anchor.point === 'pivot' ? 'pivot' : 'end'
    };
}

function normalizeColorValue(value, fallback) {
    try {
        return `#${new THREE.Color(value || fallback).getHexString()}`;
    } catch (error) {
        return fallback;
    }
}

function serializeAnimationEffects(effect) {
    if (!effect) return undefined;

    const common = {
        preset: effect.preset,
        targetCharacter: effect.targetCharacter,
        startTime: roundTime(effect.startTime),
        peakTime: roundTime(effect.peakTime),
        endTime: roundTime(effect.endTime),
        primaryColor: effect.primaryColor,
        secondaryColor: effect.secondaryColor,
        accentColor: effect.accentColor,
        glowColor: effect.glowColor
    };

    if (effect.preset === 'arcane-summon') {
        return {
            ...common,
            radius: Number(effect.radius.toFixed(2)),
            columnHeight: Number(effect.columnHeight.toFixed(2))
        };
    }

    if (effect.preset === 'blade-storm') {
        return {
            ...common,
            weaponId: effect.weaponId,
            anchorJoint: effect.anchorJoint,
            bladeLength: Number(effect.bladeLength.toFixed(2)),
            trailLength: effect.trailLength,
            trailWidth: Number(effect.trailWidth.toFixed(2)),
            shockwaveRadius: Number(effect.shockwaveRadius.toFixed(2)),
            sparkCount: effect.sparkCount
        };
    }

    return common;
}

// Purpose: animation effect definitions, VFX rigs, and scene syncing helpers.

function clipAnimationEffects(effect, startTime, endTime) {
    if (!effect) return null;

    const duration = roundTime(Math.max(0, endTime - startTime));
    if (effect.endTime < startTime || effect.startTime > endTime || duration <= 0) {
        return null;
    }

    const shiftAndClamp = (time) => roundTime(THREE.MathUtils.clamp(time - startTime, 0, duration));
    const clipped = {
        ...effect,
        startTime: shiftAndClamp(effect.startTime),
        peakTime: shiftAndClamp(effect.peakTime),
        endTime: shiftAndClamp(effect.endTime)
    };

    clipped.peakTime = THREE.MathUtils.clamp(clipped.peakTime, clipped.startTime, clipped.endTime);
    if (clipped.endTime <= clipped.startTime) {
        return null;
    }

    return clipped;
}

function smoothProgress(edge0, edge1, value) {
    if (!Number.isFinite(edge0) || !Number.isFinite(edge1)) return 0;
    if (edge1 <= edge0) return value >= edge1 ? 1 : 0;

    const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function createArcaneCircleMaterial(spin = 1) {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uSpin: { value: spin },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uSecondary: { value: new THREE.Color('#5b36ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;

            void main() {
                vUv = uv;
                vec3 transformed = position;
                vec2 centered = uv - 0.5;
                float dist = length(centered);
                transformed.z += sin(dist * 28.0 - uTime * 5.0) * 0.03 * uIntensity * (1.0 - smoothstep(0.0, 0.75, dist));
                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform float uSpin;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            float ringBand(float radius, float thickness, float dist) {
                float delta = abs(dist - radius);
                return 1.0 - smoothstep(thickness, thickness + 0.03, delta);
            }

            void main() {
                vec2 centered = vUv - 0.5;
                float dist = length(centered) * 2.0;
                float angle = atan(centered.y, centered.x);
                float outerRing = ringBand(0.82, 0.025, dist);
                float middleRing = ringBand(0.58, 0.03, dist);
                float innerRing = ringBand(0.26, 0.05, dist) * 0.6;
                float runesMask = 1.0 - smoothstep(0.18, 0.32, abs(dist - 0.58));
                float runeWave = sin(angle * 14.0 + uTime * uSpin * 2.2) * cos(angle * 5.0 - uTime * 1.1);
                float runes = pow(max(runeWave, 0.0), 3.0) * runesMask;
                float spokes = pow(max(sin(angle * 10.0 - uTime * uSpin * 1.6), 0.0), 10.0) * (1.0 - smoothstep(0.2, 0.95, dist));
                float core = pow(max(0.0, 1.0 - dist * 1.35), 3.0);
                float halo = 1.0 - smoothstep(0.92, 1.08, dist);
                float alpha = (outerRing * 1.3 + middleRing + innerRing + runes * 1.6 + spokes * 0.9 + core * 0.65) * halo * uIntensity;

                if (alpha <= 0.001) discard;

                float pulse = 0.76 + 0.24 * sin(uTime * 3.4 + dist * 18.0);
                vec3 baseColor = mix(uSecondary, uPrimary, clamp(1.15 - dist, 0.0, 1.0));
                vec3 accent = uAccent * (runes * 0.85 + core * 0.55 + outerRing * 0.25);
                gl_FragColor = vec4((baseColor * pulse) + accent, alpha);
            }
        `
    });
}

function createSummonBeamMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uSecondary: { value: new THREE.Color('#5b36ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;

            void main() {
                vUv = uv;
                vec3 transformed = position;
                float swirl = sin((uv.y * 14.0) - uTime * 4.2 + uv.x * 10.0) * 0.07 * uIntensity;
                transformed.x += normal.x * swirl;
                transformed.z += normal.z * swirl;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            void main() {
                float center = abs(vUv.x - 0.5) * 2.0;
                float body = pow(max(0.0, 1.0 - center), 1.8);
                float bands = 0.5 + 0.5 * sin(vUv.y * 30.0 - uTime * 7.5 + center * 8.0);
                float sparks = pow(max(0.0, sin(vUv.y * 48.0 + uTime * 9.0 + center * 22.0)), 10.0);
                float falloff = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.78, 1.0, vUv.y));
                float alpha = body * falloff * (0.15 + bands * 0.25 + sparks * 0.55) * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uSecondary, uPrimary, bands);
                color += uAccent * sparks * 0.65;
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createSummonFlareMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uAccent;

            void main() {
                vec2 centered = vUv - 0.5;
                float dist = length(centered) * 2.0;
                float angle = atan(centered.y, centered.x);
                float glow = pow(max(0.0, 1.0 - dist), 2.4);
                float rays = pow(max(cos(angle * 4.0 + uTime * 2.4), 0.0), 7.0);
                float halo = 1.0 - smoothstep(0.58, 1.0, dist);
                float alpha = (glow + rays * 0.45) * halo * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uAccent, uPrimary, glow);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createSummonParticleMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uRadius: { value: 2.8 },
            uHeight: { value: 5.5 },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            uniform float uTime;
            uniform float uIntensity;
            uniform float uRadius;
            uniform float uHeight;
            attribute float aSeed;
            attribute float aAngle;
            attribute float aRadius;
            attribute float aLift;
            varying float vAlpha;
            varying float vHeat;

            void main() {
                float progress = fract(uTime * (0.18 + aSeed * 0.82) + aLift);
                float orbit = aAngle + uTime * (0.65 + aSeed * 1.9);
                float radius = aRadius * mix(0.45, 1.0, progress) * (0.35 + uIntensity * 0.65) * uRadius;
                vec3 transformed = vec3(cos(orbit) * radius, progress * uHeight, sin(orbit) * radius);
                transformed.x += sin(uTime * 1.3 + aSeed * 21.0) * 0.18;
                transformed.z += cos(uTime * 1.15 + aSeed * 13.0) * 0.18;

                vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
                float pointScale = (12.0 + 22.0 * aSeed) * uIntensity * (1.25 - progress);
                gl_PointSize = max(0.0, pointScale * (280.0 / -mvPosition.z));
                vAlpha = uIntensity * (1.0 - progress);
                vHeat = progress;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uPrimary;
            uniform vec3 uAccent;
            varying float vAlpha;
            varying float vHeat;

            void main() {
                vec2 centered = gl_PointCoord - 0.5;
                float dist = length(centered) * 2.0;
                float glow = pow(max(0.0, 1.0 - dist), 2.6);
                float alpha = glow * vAlpha;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uAccent, uPrimary, 1.0 - vHeat);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createSummonVfxRig() {
    const group = new THREE.Group();
    group.name = 'ArcaneSummonFx';
    group.visible = false;

    const circle = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), createArcaneCircleMaterial(1.2));
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.04;
    circle.renderOrder = 2;
    group.add(circle);

    const outerCircle = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), createArcaneCircleMaterial(-0.82));
    outerCircle.rotation.x = -Math.PI / 2;
    outerCircle.position.y = 0.11;
    outerCircle.renderOrder = 1;
    group.add(outerCircle);

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.05, 1, 48, 1, true), createSummonBeamMaterial());
    beam.renderOrder = 3;
    group.add(beam);

    const flare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), createSummonFlareMaterial());
    flare.renderOrder = 5;
    flare.frustumCulled = false;
    group.add(flare);

    const particleCount = 180;
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(particleCount * 3), 3));

    const seeds = new Float32Array(particleCount);
    const angles = new Float32Array(particleCount);
    const radii = new Float32Array(particleCount);
    const lifts = new Float32Array(particleCount);

    for (let index = 0; index < particleCount; index += 1) {
        seeds[index] = Math.random();
        angles[index] = Math.random() * Math.PI * 2;
        radii[index] = 0.18 + Math.random() * 0.42;
        lifts[index] = Math.random();
    }

    particleGeometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    particleGeometry.setAttribute('aAngle', new THREE.Float32BufferAttribute(angles, 1));
    particleGeometry.setAttribute('aRadius', new THREE.Float32BufferAttribute(radii, 1));
    particleGeometry.setAttribute('aLift', new THREE.Float32BufferAttribute(lifts, 1));

    const particles = new THREE.Points(particleGeometry, createSummonParticleMaterial());
    particles.position.y = 0.12;
    particles.frustumCulled = false;
    particles.renderOrder = 6;
    group.add(particles);

    const light = new THREE.PointLight(0xf0f9ff, 0, 14, 1.8);
    group.add(light);

    return {
        group,
        circle,
        outerCircle,
        beam,
        flare,
        particles,
        light,
        time: 0
    };
}

function createBladeTrailGeometry(maxTrailPoints) {
    const geometry = new THREE.BufferGeometry();
    const vertexCount = maxTrailPoints * 2;
    const positions = new Float32Array(vertexCount * 3);
    const trailProgress = new Float32Array(vertexCount);
    const trailEdge = new Float32Array(vertexCount);
    const indices = [];

    for (let index = 0; index < maxTrailPoints; index += 1) {
        const progress = maxTrailPoints <= 1 ? 0 : index / (maxTrailPoints - 1);
        const left = index * 2;
        const right = left + 1;
        trailProgress[left] = progress;
        trailProgress[right] = progress;
        trailEdge[left] = -1;
        trailEdge[right] = 1;

        if (index < maxTrailPoints - 1) {
            const nextLeft = left + 2;
            const nextRight = left + 3;
            indices.push(left, right, nextLeft, right, nextRight, nextLeft);
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aTrail', new THREE.BufferAttribute(trailProgress, 1));
    geometry.setAttribute('aEdge', new THREE.BufferAttribute(trailEdge, 1));
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    return geometry;
}

function createBladeTrailMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uSecondary: { value: new THREE.Color('#8b5cff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            attribute float aTrail;
            attribute float aEdge;
            varying float vTrail;
            varying float vEdge;

            void main() {
                vTrail = aTrail;
                vEdge = aEdge;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying float vTrail;
            varying float vEdge;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            void main() {
                float fade = pow(max(0.0, 1.0 - vTrail), 1.35);
                float center = 1.0 - smoothstep(0.08, 1.0, abs(vEdge));
                float rim = smoothstep(0.35, 0.95, abs(vEdge));
                float pulse = 0.72 + 0.28 * sin(uTime * 12.0 - vTrail * 24.0);
                float shard = pow(max(0.0, sin((1.0 - vTrail) * 34.0 + uTime * 18.0)), 5.0);
                float alpha = (center * 0.48 + rim * 0.24 + shard * 0.3) * fade * pulse * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uSecondary, uPrimary, center);
                color += uAccent * (rim * 0.55 + shard * 0.7);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeCoreMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uAccent;

            void main() {
                float center = 1.0 - abs(vUv.x - 0.5) * 2.0;
                float body = pow(max(center, 0.0), 0.7);
                float hotEdge = pow(max(0.0, sin(vUv.y * 24.0 - uTime * 16.0)), 8.0);
                float taper = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.86, 1.0, vUv.y));
                float alpha = (body * 0.75 + hotEdge * 0.45) * taper * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = uPrimary * (0.9 + body * 0.7) + uAccent * hotEdge;
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeShockwaveMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uProgress: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uSecondary: { value: new THREE.Color('#8b5cff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform float uProgress;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            void main() {
                vec2 centered = vUv - 0.5;
                float dist = length(centered) * 2.0;
                float angle = atan(centered.y, centered.x);
                float ringRadius = 0.18 + uProgress * 0.68;
                float ring = 1.0 - smoothstep(0.025, 0.095, abs(dist - ringRadius));
                float inner = 1.0 - smoothstep(0.0, ringRadius, dist);
                float spokes = pow(max(0.0, sin(angle * 12.0 - uTime * 9.0)), 7.0) * (1.0 - smoothstep(0.1, 0.92, dist));
                float alpha = (ring * 0.82 + inner * 0.05 + spokes * 0.22) * (1.0 - uProgress * 0.58) * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uSecondary, uPrimary, ring);
                color += uAccent * (spokes * 0.55 + ring * 0.25);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeSparkMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            attribute float aSeed;
            varying float vSeed;
            uniform float uIntensity;

            void main() {
                vSeed = aSeed;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float size = (10.0 + 24.0 * aSeed) * uIntensity;
                gl_PointSize = max(0.0, size * (260.0 / -mvPosition.z));
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vSeed;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uAccent;

            void main() {
                vec2 centered = gl_PointCoord - 0.5;
                float dist = length(centered) * 2.0;
                float glow = pow(max(0.0, 1.0 - dist), 2.8);
                float alpha = glow * uIntensity * (0.35 + vSeed * 0.65);

                if (alpha <= 0.001) discard;

                vec3 color = mix(uAccent, uPrimary, vSeed);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeStormVfxRig() {
    const group = new THREE.Group();
    group.name = 'BladeStormFx';
    group.visible = false;

    const maxTrailPoints = 48;
    const trail = new THREE.Mesh(createBladeTrailGeometry(maxTrailPoints), createBladeTrailMaterial());
    trail.frustumCulled = false;
    trail.renderOrder = 12;
    group.add(trail);

    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.11, 1, 18, 1, true), createBladeCoreMaterial());
    blade.frustumCulled = false;
    blade.renderOrder = 14;
    group.add(blade);

    const shockwave = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), createBladeShockwaveMaterial());
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.position.y = 0.08;
    shockwave.renderOrder = 10;
    group.add(shockwave);

    const sparkCount = 180;
    const sparkGeometry = new THREE.BufferGeometry();
    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkSeeds = new Float32Array(sparkCount);
    const sparkSwirls = new Float32Array(sparkCount);

    for (let index = 0; index < sparkCount; index += 1) {
        sparkSeeds[index] = Math.random();
        sparkSwirls[index] = Math.random() * Math.PI * 2;
    }

    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeometry.setAttribute('aSeed', new THREE.BufferAttribute(sparkSeeds, 1));
    sparkGeometry.setDrawRange(0, 0);

    const particles = new THREE.Points(sparkGeometry, createBladeSparkMaterial());
    particles.frustumCulled = false;
    particles.renderOrder = 15;
    group.add(particles);

    const light = new THREE.PointLight(0xf7fbff, 0, 12, 1.8);
    group.add(light);

    return {
        group,
        trail,
        blade,
        shockwave,
        particles,
        light,
        time: 0,
        history: [],
        lastClipTime: null,
        maxTrailPoints,
        sparkCount,
        sparkPositions,
        sparkSeeds,
        sparkSwirls
    };
}

function setAnimationEffects(effectData) {
    activeAnimationEffects = normalizeAnimationEffects(effectData);

    if (!activeAnimationEffects) {
        hideSummonVfx();
        hideBladeStormVfx();
        return;
    }

    if (activeAnimationEffects.preset === 'arcane-summon') {
        hideBladeStormVfx();
        setSummonVfxColors(activeAnimationEffects);
    } else if (activeAnimationEffects.preset === 'blade-storm') {
        hideSummonVfx();
        setBladeStormVfxColors(activeAnimationEffects);
        if (slashVfx) {
            slashVfx.history.length = 0;
            slashVfx.lastClipTime = null;
        }
    }

    applyAnimationEffectsState(currentTime);
}

function setSummonVfxColors(effect) {
    if (!summonVfx) return;

    const primary = new THREE.Color(effect.primaryColor);
    const secondary = new THREE.Color(effect.secondaryColor);
    const accent = new THREE.Color(effect.accentColor);
    const glow = new THREE.Color(effect.glowColor);

    [summonVfx.circle.material, summonVfx.outerCircle.material, summonVfx.beam.material].forEach(material => {
        material.uniforms.uPrimary.value.copy(primary);
        material.uniforms.uAccent.value.copy(accent);
        if (material.uniforms.uSecondary) {
            material.uniforms.uSecondary.value.copy(secondary);
        }
    });

    summonVfx.flare.material.uniforms.uPrimary.value.copy(primary);
    summonVfx.flare.material.uniforms.uAccent.value.copy(accent);
    summonVfx.particles.material.uniforms.uPrimary.value.copy(primary);
    summonVfx.particles.material.uniforms.uAccent.value.copy(accent);
    summonVfx.light.color.copy(glow);
}

function setBladeStormVfxColors(effect) {
    if (!slashVfx) return;

    const primary = new THREE.Color(effect.primaryColor);
    const secondary = new THREE.Color(effect.secondaryColor);
    const accent = new THREE.Color(effect.accentColor);
    const glow = new THREE.Color(effect.glowColor);

    [slashVfx.trail.material, slashVfx.shockwave.material].forEach(material => {
        material.uniforms.uPrimary.value.copy(primary);
        material.uniforms.uSecondary.value.copy(secondary);
        material.uniforms.uAccent.value.copy(accent);
    });

    slashVfx.blade.material.uniforms.uPrimary.value.copy(primary);
    slashVfx.blade.material.uniforms.uAccent.value.copy(accent);
    slashVfx.particles.material.uniforms.uPrimary.value.copy(primary);
    slashVfx.particles.material.uniforms.uAccent.value.copy(accent);
    slashVfx.light.color.copy(glow);
}

function hideSummonVfx() {
    if (!summonVfx) return;
    summonVfx.group.visible = false;
    summonVfx.light.intensity = 0;
}

function hideBladeStormVfx() {
    if (!slashVfx) return;
    slashVfx.group.visible = false;
    slashVfx.light.intensity = 0;
    slashVfx.trail.geometry.setDrawRange(0, 0);
    slashVfx.particles.geometry.setDrawRange(0, 0);
}

function applyAnimationEffectsState(time) {
    const effect = activeAnimationEffects;
    const targetCharacter = effect ? characters[effect.targetCharacter] : null;

    if (!effect || !targetCharacter) {
        hideSummonVfx();
        hideBladeStormVfx();
        return;
    }

    if (effect.preset === 'arcane-summon') {
        hideBladeStormVfx();
        updateSummonEffect(effect, targetCharacter, time);
        return;
    }

    if (effect.preset === 'blade-storm') {
        hideSummonVfx();
        updateBladeStormEffect(effect, targetCharacter, time);
        return;
    }

    hideSummonVfx();
    hideBladeStormVfx();
}

function updateSummonEffect(effect, targetCharacter, time) {
    if (!summonVfx) return;

    const charge = smoothProgress(effect.startTime, effect.peakTime, time);
    const decay = 1 - smoothProgress(effect.peakTime, effect.endTime, time);
    const envelope = THREE.MathUtils.clamp(charge * decay, 0, 1);

    if (envelope <= 0.001) {
        hideSummonVfx();
        return;
    }

    const pulse = 0.82 + 0.18 * Math.sin(summonVfx.time * 4.2 + time * 5.0);
    const brightness = envelope * pulse;
    const rise = smoothProgress(effect.startTime, effect.peakTime, time);
    const settle = smoothProgress(effect.peakTime, effect.endTime, time);
    const radius = effect.radius;
    const beamHeight = effect.columnHeight * (0.38 + rise * 0.62);

    effectAnchorPosition.copy(targetCharacter.position);
    summonVfx.group.position.set(effectAnchorPosition.x, 0.02, effectAnchorPosition.z);
    summonVfx.group.visible = true;

    summonVfx.circle.scale.set(radius * 2.05, radius * 2.05, 1);
    summonVfx.outerCircle.scale.set(radius * 2.45, radius * 2.45, 1);
    summonVfx.circle.rotation.z = summonVfx.time * 0.35;
    summonVfx.outerCircle.rotation.z = -summonVfx.time * 0.26;
    summonVfx.circle.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.circle.material.uniforms.uIntensity.value = brightness;
    summonVfx.outerCircle.material.uniforms.uTime.value = summonVfx.time + 1.4;
    summonVfx.outerCircle.material.uniforms.uIntensity.value = envelope * 0.68;

    summonVfx.beam.scale.set(radius * (0.62 + rise * 0.08), beamHeight, radius * (0.62 + rise * 0.08));
    summonVfx.beam.position.y = beamHeight * 0.5;
    summonVfx.beam.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.beam.material.uniforms.uIntensity.value = envelope * (0.48 + rise * 0.52);

    summonVfx.flare.position.y = effect.columnHeight * (0.44 + rise * 0.16);
    summonVfx.flare.scale.set(radius * (1.1 + rise * 0.45), radius * (1.45 + rise * 0.8), 1);
    summonVfx.flare.quaternion.copy(camera.quaternion);
    summonVfx.flare.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.flare.material.uniforms.uIntensity.value = envelope * (0.25 + rise * 0.95) * (1 - settle * 0.35);

    summonVfx.particles.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.particles.material.uniforms.uIntensity.value = envelope;
    summonVfx.particles.material.uniforms.uRadius.value = radius * 0.4;
    summonVfx.particles.material.uniforms.uHeight.value = effect.columnHeight * (0.52 + rise * 0.48);

    summonVfx.light.position.y = effect.columnHeight * (0.52 + rise * 0.08);
    summonVfx.light.distance = radius * 5.5;
    summonVfx.light.intensity = envelope * 5.4;
}

function getBladeStormEndpoints(effect) {
    const weapon = effect.weaponId
        ? weapons.find(item => Number(item.userData.weaponId) === effect.weaponId)
        : weapons[0];

    if (weapon) {
        weapon.updateMatrixWorld(true);
        slashBladeBase.set(0, 0, 0);
        weapon.localToWorld(slashBladeBase);
        slashBladeTip.set(0, 1, 0);
        weapon.localToWorld(slashBladeTip);
        return slashBladeBase.distanceToSquared(slashBladeTip) > 0.0001;
    }

    const joint = findJointByName(effect.anchorJoint) || findJointByName(`Right_Lower_Arm_${effect.targetCharacter}`);
    if (!joint) return false;

    joint.updateMatrixWorld(true);
    const localEnd = getJointAnchorLocalPosition(joint, 'end');
    slashBladeBase.copy(localEnd);
    joint.localToWorld(slashBladeBase);

    slashTempPoint.copy(localEnd);
    if (slashTempPoint.lengthSq() < 0.0001) {
        slashTempPoint.set(0, -1, 0);
    } else {
        slashTempPoint.normalize();
    }
    slashTempPoint.multiplyScalar(effect.bladeLength).add(localEnd);
    slashBladeTip.copy(slashTempPoint);
    joint.localToWorld(slashBladeTip);
    return slashBladeBase.distanceToSquared(slashBladeTip) > 0.0001;
}

function updateBladeStormEffect(effect, targetCharacter, time) {
    if (!slashVfx) return;

    const charge = smoothProgress(effect.startTime, effect.peakTime, time);
    const decay = 1 - smoothProgress(effect.peakTime, effect.endTime, time);
    const envelope = THREE.MathUtils.clamp(charge * decay, 0, 1);

    if (envelope <= 0.001 || !getBladeStormEndpoints(effect)) {
        hideBladeStormVfx();
        return;
    }

    if (slashVfx.lastClipTime !== null && time < slashVfx.lastClipTime - 0.035) {
        slashVfx.history.length = 0;
    }
    slashVfx.lastClipTime = time;

    const activePoints = Math.min(effect.trailLength, slashVfx.maxTrailPoints);
    slashVfx.history.unshift(slashBladeTip.clone());
    while (slashVfx.history.length < activePoints) {
        slashVfx.history.push(slashBladeTip.clone());
    }
    while (slashVfx.history.length > activePoints) {
        slashVfx.history.pop();
    }

    slashBladeDirection.copy(slashBladeTip).sub(slashBladeBase);
    const bladeLength = Math.max(0.001, slashBladeDirection.length());
    slashBladeDirection.divideScalar(bladeLength);
    slashBladeMid.copy(slashBladeBase).lerp(slashBladeTip, 0.5);

    slashVfx.group.visible = true;
    updateBladeStormTrail(effect, activePoints, envelope);
    updateBladeStormBlade(effect, bladeLength, envelope);
    updateBladeStormShockwave(effect, targetCharacter, time, envelope);
    updateBladeStormParticles(effect, bladeLength, envelope);

    slashVfx.light.position.copy(slashBladeTip);
    slashVfx.light.distance = effect.shockwaveRadius * 1.8;
    slashVfx.light.intensity = envelope * 0.9;
}

function updateBladeStormTrail(effect, activePoints, envelope) {
    const geometry = slashVfx.trail.geometry;
    const positions = geometry.attributes.position.array;

    for (let index = 0; index < activePoints; index += 1) {
        const point = slashVfx.history[Math.min(index, slashVfx.history.length - 1)] || slashBladeTip;
        const prev = slashVfx.history[Math.max(0, index - 1)] || point;
        const next = slashVfx.history[Math.min(slashVfx.history.length - 1, index + 1)] || point;

        slashTempPoint.copy(point);
        slashTempPrev.copy(prev);
        slashTempNext.copy(next);
        slashTrailTangent.copy(slashTempPrev).sub(slashTempNext);
        if (slashTrailTangent.lengthSq() < 0.0001) {
            slashTrailTangent.copy(slashBladeDirection);
        } else {
            slashTrailTangent.normalize();
        }

        slashTrailView.copy(camera.position).sub(slashTempPoint);
        slashTrailSide.crossVectors(slashTrailTangent, slashTrailView);
        if (slashTrailSide.lengthSq() < 0.0001) {
            slashTrailSide.crossVectors(slashTrailTangent, WORLD_UP);
        }
        if (slashTrailSide.lengthSq() < 0.0001) {
            slashTrailSide.crossVectors(slashTrailTangent, slashFallbackAxis);
        }
        slashTrailSide.normalize();

        const progress = activePoints <= 1 ? 0 : index / (activePoints - 1);
        const width = effect.trailWidth * Math.pow(1 - progress, 0.62) * (0.55 + envelope * 0.85);
        const leftOffset = (index * 2) * 3;
        const rightOffset = leftOffset + 3;

        positions[leftOffset] = slashTempPoint.x + slashTrailSide.x * width;
        positions[leftOffset + 1] = slashTempPoint.y + slashTrailSide.y * width;
        positions[leftOffset + 2] = slashTempPoint.z + slashTrailSide.z * width;
        positions[rightOffset] = slashTempPoint.x - slashTrailSide.x * width;
        positions[rightOffset + 1] = slashTempPoint.y - slashTrailSide.y * width;
        positions[rightOffset + 2] = slashTempPoint.z - slashTrailSide.z * width;
    }

    geometry.setDrawRange(0, Math.max(0, (activePoints - 1) * 6));
    geometry.attributes.position.needsUpdate = true;
    slashVfx.trail.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.trail.material.uniforms.uIntensity.value = envelope * 0.82;
}

function updateBladeStormBlade(effect, bladeLength, envelope) {
    slashBladeQuaternion.setFromUnitVectors(WORLD_UP, slashBladeDirection);
    slashVfx.blade.position.copy(slashBladeMid);
    slashVfx.blade.quaternion.copy(slashBladeQuaternion);
    slashVfx.blade.scale.set(1 + effect.trailWidth * 0.8, bladeLength, 1 + effect.trailWidth * 0.8);
    slashVfx.blade.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.blade.material.uniforms.uIntensity.value = envelope * 0.95;
}

function updateBladeStormShockwave(effect, targetCharacter, time, envelope) {
    const progress = smoothProgress(effect.startTime, effect.endTime, time);
    const scale = effect.shockwaveRadius * (1.25 + Math.sin(progress * Math.PI) * 0.35);
    slashVfx.shockwave.position.set(targetCharacter.position.x, 0.08, targetCharacter.position.z);
    slashVfx.shockwave.scale.set(scale, scale, 1);
    slashVfx.shockwave.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.shockwave.material.uniforms.uProgress.value = progress;
    slashVfx.shockwave.material.uniforms.uIntensity.value = envelope * 0.46;
}

function updateBladeStormParticles(effect, bladeLength, envelope) {
    const geometry = slashVfx.particles.geometry;
    const positions = slashVfx.sparkPositions;
    const count = Math.min(effect.sparkCount, slashVfx.sparkCount);

    slashSparkSide.crossVectors(slashBladeDirection, WORLD_UP);
    if (slashSparkSide.lengthSq() < 0.0001) {
        slashSparkSide.crossVectors(slashBladeDirection, slashFallbackAxis);
    }
    slashSparkSide.normalize();
    slashSparkLift.crossVectors(slashSparkSide, slashBladeDirection).normalize();

    for (let index = 0; index < count; index += 1) {
        const seed = slashVfx.sparkSeeds[index];
        const phase = (slashVfx.time * (0.7 + seed * 1.8) + seed * 9.7) % 1;
        const orbit = slashVfx.sparkSwirls[index] + slashVfx.time * (3.8 + seed * 6.5);
        const spread = effect.trailWidth * (0.25 + seed * 1.15) * (1.15 - phase);
        const backstep = bladeLength * (0.12 + phase * 0.82) * (0.35 + seed * 0.65);

        slashTempPoint.copy(slashBladeTip)
            .addScaledVector(slashBladeDirection, -backstep)
            .addScaledVector(slashSparkSide, Math.cos(orbit) * spread)
            .addScaledVector(slashSparkLift, Math.sin(orbit) * spread + phase * 0.42);

        const offset = index * 3;
        positions[offset] = slashTempPoint.x;
        positions[offset + 1] = slashTempPoint.y;
        positions[offset + 2] = slashTempPoint.z;
    }

    geometry.setDrawRange(0, count);
    geometry.attributes.position.needsUpdate = true;
    slashVfx.particles.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.particles.material.uniforms.uIntensity.value = envelope;
}

function updateAnimationEffects(delta) {
    if (summonVfx) summonVfx.time += delta;
    if (slashVfx) slashVfx.time += delta;
    applyAnimationEffectsState(currentTime);
}

function syncSceneToAsset(asset) {
    const requiredCount = Math.max(0, getAssetCharacterCount(asset));
    const colors = normalizeCharacterColors(asset?.scene?.characterColors);

    if (characters.length !== requiredCount) {
        clearSceneCharacters();
        for (let index = 0; index < requiredCount; index += 1) {
            createCharacter({ color: colors[index] });
        }
    } else if (colors.length > 0) {
        characters.forEach((character, index) => {
            if (!colors[index]) return;
            setCharacterColor(character, colors[index]);
        });
    }

    syncWeaponsToAsset(asset);
}

function getCharacterColors() {
    return characters.map(character => character.userData.characterColor || '#ffffff');
}

function downloadAssetFile(asset) {
    const blob = new Blob([JSON.stringify(asset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = asset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || asset.type;

    link.href = url;
    link.download = `${safeName}.${asset.type}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

// Purpose: MediaPipe motion-capture import, video preview sync, and timeline recording.

async function ensureMotionCaptureLandmarker() {
    if (motionCapture.poseLandmarker) {
        return motionCapture.poseLandmarker;
    }

    if (!motionCapture.importsPromise) {
        motionCapture.importsPromise = import(MOTION_CAPTURE_TASKS_VISION_URL).then(module => {
            motionCapture.FilesetResolver = module.FilesetResolver;
            motionCapture.PoseLandmarker = module.PoseLandmarker;
            return module;
        });
    }

    await motionCapture.importsPromise;
    setMotionCaptureStateLabel('Loading');
    setStatus('Loading MediaPipe motion capture...', 'info');

    const vision = await motionCapture.FilesetResolver.forVisionTasks(MOTION_CAPTURE_WASM_ROOT);
    try {
        motionCapture.poseLandmarker = await motionCapture.PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: MOTION_CAPTURE_MODEL_PATH,
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.45,
            minPosePresenceConfidence: 0.45,
            minTrackingConfidence: 0.45
        });
    } catch (error) {
        motionCapture.poseLandmarker = await motionCapture.PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: MOTION_CAPTURE_MODEL_PATH,
                delegate: 'CPU'
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.45,
            minPosePresenceConfidence: 0.45,
            minTrackingConfidence: 0.45
        });
    }

    return motionCapture.poseLandmarker;
}

function setMotionCaptureStateLabel(label) {
    if (ui.motionCaptureState) {
        ui.motionCaptureState.textContent = label;
    }
}

function formatMotionCaptureClock(value) {
    const totalSeconds = Math.max(0, Number.isFinite(value) ? value : 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function syncMotionCaptureTransportUi() {
    if (!ui.motionCaptureRecordBtn || !ui.motionCapturePlayBtn || !ui.motionCaptureScrub || !ui.motionCaptureTime) return;

    const isUpload = motionCapture.activeSource === 'upload' && !!ui.motionCaptureVideo?.src;
    const isScreen = motionCapture.activeSource === 'screen';
    const hasRecordedTimeline = keyframes.length > 0;
    const videoDuration = Number.isFinite(ui.motionCaptureVideo?.duration) ? ui.motionCaptureVideo.duration : 0;
    const currentVideoTime = Number.isFinite(ui.motionCaptureVideo?.currentTime) ? ui.motionCaptureVideo.currentTime : currentTime;
    const recordedDuration = Math.max(getAnimationEndTime(), currentTime, 0);
    const usesUploadSourceTransport = isUpload;
    const duration = usesUploadSourceTransport ? videoDuration : recordedDuration;
    const position = usesUploadSourceTransport ? currentVideoTime : currentTime;

    ui.motionCaptureRecordBtn.textContent = motionCapture.isRecording ? 'Stop Rec' : 'Record';
    ui.motionCaptureRecordBtn.classList.toggle('recording', motionCapture.isRecording);
    ui.motionCaptureRecordBtn.disabled = motionCapture.activeSource === 'none';
    ui.motionCapturePlayBtn.textContent = usesUploadSourceTransport
        ? (!ui.motionCaptureVideo.paused ? 'Pause' : 'Play')
        : (isPlaying ? 'Pause' : 'Play');
    ui.motionCapturePlayBtn.disabled = usesUploadSourceTransport ? false : keyframes.length < 2;
    ui.motionCaptureStopBtn.disabled = motionCapture.activeSource === 'none';
    ui.motionCaptureScrub.disabled = usesUploadSourceTransport ? false : !hasRecordedTimeline;
    ui.motionCaptureScrub.max = String(Math.max(duration, 0));
    ui.motionCaptureScrub.value = String(Math.min(position, duration || 0));
    ui.motionCaptureTime.textContent = isScreen && !hasRecordedTimeline
        ? `${formatMotionCaptureClock(currentVideoTime)} live`
        : `${formatMotionCaptureClock(position)} / ${formatMotionCaptureClock(duration)}`;
}

function toggleMotionCaptureVideoPlayback() {
    if (motionCapture.activeSource === 'upload' && ui.motionCaptureVideo?.src) {
        if (ui.motionCaptureVideo.paused) {
            ui.motionCaptureVideo.play().catch(() => {});
        } else {
            ui.motionCaptureVideo.pause();
        }
        syncMotionCaptureTransportUi();
        return;
    }

    if (keyframes.length >= 2) {
        motionCapture.screenTimelinePreview = true;
        togglePlay();
    }
}

function toggleMotionCaptureRecording() {
    if (motionCapture.activeSource === 'none') return;

    if (motionCapture.isRecording) {
        motionCapture.isRecording = false;
        setMotionCaptureStateLabel('Tracking');
        setStatus(
            keyframes.length > 0
                ? `Motion capture recorded ${keyframes.length} keyframes to the timeline.`
                : 'Recording stopped before any keyframes were captured.',
            keyframes.length > 0 ? 'success' : 'info'
        );
        syncMotionCaptureTransportUi();
        return;
    }

    resetTimelineForMotionCapture();
    motionCapture.isRecording = true;
    motionCapture.screenTimelinePreview = false;
    motionCapture.recordStartTime = Number.isFinite(ui.motionCaptureVideo?.currentTime) ? ui.motionCaptureVideo.currentTime : 0;
    motionCapture.lastProcessedVideoTime = -1;
    setMotionCaptureStateLabel('Recording');
    setStatus('Recording armed. Frames will now be written into the timeline from the current source position.', 'success');
    syncMotionCaptureTransportUi();
    processMotionCaptureFrame();
}

function stopMotionCaptureFromUi() {
    if (motionCapture.activeSource === 'upload' && ui.motionCaptureVideo?.src) {
        ui.motionCaptureVideo.pause();
        motionCapture.isRecording = false;
        motionCapture.videoSeekingFromTimeline = true;
        ui.motionCaptureVideo.currentTime = 0;
        motionCapture.lastProcessedVideoTime = -1;
        window.setTimeout(() => {
            motionCapture.videoSeekingFromTimeline = false;
            syncMotionCaptureTransportUi();
        }, 0);
        if (keyframes.length > 0) {
            setCurrentTime(0, { forceVideoSeek: false });
        }
        processMotionCaptureFrame();
        return;
    }

    if (motionCapture.activeSource === 'screen') {
        motionCapture.isRecording = false;
        if (keyframes.length > 0) {
            motionCapture.screenTimelinePreview = true;
            stopPlayback();
            setCurrentTime(0, { forceVideoSeek: false });
            syncMotionCaptureTransportUi();
            return;
        }
        stopMotionCaptureSource({ preservePreview: false, preservePose: true });
    }
}

function handleMotionCaptureScrubInput() {
    if (motionCapture.activeSource === 'upload' && ui.motionCaptureVideo?.src) {
        const nextTime = Number.parseFloat(ui.motionCaptureScrub.value);
        if (!Number.isFinite(nextTime)) return;

        motionCapture.videoSeekingFromTimeline = true;
        ui.motionCaptureVideo.currentTime = nextTime;
        motionCapture.lastProcessedVideoTime = -1;
        window.setTimeout(() => {
            motionCapture.videoSeekingFromTimeline = false;
            syncMotionCaptureTransportUi();
        }, 0);
        return;
    }

    const nextTime = Number.parseFloat(ui.motionCaptureScrub.value);
    if (!Number.isFinite(nextTime)) return;
    motionCapture.screenTimelinePreview = true;
    setCurrentTime(nextTime, { forceVideoSeek: false });
}

function handleMotionCaptureVideoSeeked() {
    motionCapture.lastProcessedVideoTime = -1;
    processMotionCaptureFrame();
    syncMotionCaptureTransportUi();
}

function beginMotionCapturePanelDrag(event) {
    if (event.button !== 0 || !ui.motionCapturePreview) return;

    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, input, video')) {
        return;
    }

    const bounds = ui.motionCapturePreview.getBoundingClientRect();
    motionCapture.dragPointerId = event.pointerId;
    motionCapture.dragOffsetX = event.clientX - bounds.left;
    motionCapture.dragOffsetY = event.clientY - bounds.top;
    ui.motionCapturePreview.classList.add('dragging');
    ui.motionCaptureHeader?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
}

function updateMotionCapturePanelDrag(event) {
    if (motionCapture.dragPointerId !== event.pointerId || !ui.motionCapturePreview) return;

    const width = ui.motionCapturePreview.offsetWidth;
    const height = ui.motionCapturePreview.offsetHeight;
    const maxLeft = Math.max(0, window.innerWidth - width);
    const maxTop = Math.max(0, window.innerHeight - height);
    const left = THREE.MathUtils.clamp(event.clientX - motionCapture.dragOffsetX, 0, maxLeft);
    const top = THREE.MathUtils.clamp(event.clientY - motionCapture.dragOffsetY, 0, maxTop);

    ui.motionCapturePreview.style.left = `${left}px`;
    ui.motionCapturePreview.style.top = `${top}px`;
    ui.motionCapturePreview.style.right = 'auto';
}

function endMotionCapturePanelDrag(event) {
    if (motionCapture.dragPointerId !== event.pointerId) return;
    ui.motionCaptureHeader?.releasePointerCapture?.(event.pointerId);
    motionCapture.dragPointerId = null;
    ui.motionCapturePreview?.classList.remove('dragging');
}

function showMotionCapturePreview() {
    ui.motionCapturePreview?.classList.remove('hidden');
    syncMotionCaptureTransportUi();
}

function hideMotionCapturePreview() {
    ui.motionCapturePreview?.classList.add('hidden');
}

function resizeMotionCaptureOverlay() {
    if (!ui.motionCaptureOverlay) return;

    const width = Math.max(1, Math.round(ui.motionCaptureOverlay.clientWidth * window.devicePixelRatio));
    const height = Math.max(1, Math.round(ui.motionCaptureOverlay.clientHeight * window.devicePixelRatio));
    if (ui.motionCaptureOverlay.width === width && ui.motionCaptureOverlay.height === height) return;

    ui.motionCaptureOverlay.width = width;
    ui.motionCaptureOverlay.height = height;
    clearMotionCaptureOverlay();
}

function clearMotionCaptureOverlay() {
    if (!ui.motionCaptureOverlay) return;
    resizeMotionCaptureOverlay();
    const context = ui.motionCaptureOverlay.getContext('2d');
    context.clearRect(0, 0, ui.motionCaptureOverlay.width, ui.motionCaptureOverlay.height);
    syncMotionCaptureTransportUi();
}

function handleMotionCaptureVideoMetadataLoaded() {
    resizeMotionCaptureOverlay();
    showMotionCapturePreview();
    ui.motionCaptureLabel.textContent = motionCapture.sourceLabel;
    syncMotionCaptureTransportUi();
}

function handleMotionCaptureVideoPlay() {
    if (motionCapture.videoSeekingFromTimeline) return;
    if (motionCapture.activeSource === 'upload') {
        setMotionCaptureStateLabel(motionCapture.isRecording ? 'Recording' : 'Tracking');
        startMotionCaptureLoop();
    }
    syncMotionCaptureTransportUi();
}

function handleMotionCaptureVideoPause() {
    if (motionCapture.videoSeekingFromTimeline) return;
    if (motionCapture.activeSource === 'upload' && !isPlaying) {
        setMotionCaptureStateLabel(motionCapture.isRecording ? 'Recording' : 'Paused');
    }
    syncMotionCaptureTransportUi();
}

function handleMotionCaptureVideoEnded() {
    if (motionCapture.activeSource === 'upload') {
        setMotionCaptureStateLabel('Complete');
        syncMotionCapturePreviewToTimeline(true);
        setStatus(`Motion capture recorded ${keyframes.length} timeline frames from the uploaded video.`, 'success');
    }
    syncMotionCaptureTransportUi();
}

function resetTimelineForMotionCapture() {
    stopPlayback();
    pointerState = null;
    keyframes.length = 0;
    selectedKeyframeId = null;
    currentTime = 0;
    nextKeyframeId = 1;
    timelineViewDuration = TIMELINE_MIN_DURATION;
    resetClipRange();
    setAnimationEffects(null);
    refreshTimelineUi();
}

function prepareMotionCaptureSession(label) {
    if (characters.length === 0) {
        createCharacter();
    }

    motionCapture.latestLandmarks = [];
    motionCapture.basePose = capturePose();
    motionCapture.currentPose = clonePoseState(motionCapture.basePose);
    motionCapture.rootBaseline = null;
    motionCapture.isRecording = false;
    motionCapture.recordStartTime = 0;
    motionCapture.screenTimelinePreview = false;
    motionCapture.lastProcessedVideoTime = -1;
    motionCapture.sourceLabel = label;
    ui.motionCaptureLabel.textContent = label;
    setMotionCaptureStateLabel('Ready');
    showMotionCapturePreview();
    clearMotionCaptureOverlay();
    syncMotionCaptureTransportUi();
}

async function startMotionCaptureScreenShare() {
    try {
        await ensureMotionCaptureLandmarker();
        stopMotionCaptureSource({ preservePreview: false, preservePose: true, skipStatus: true });

        motionCapture.stream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 30, max: 30 } },
            audio: false
        });

        const [track] = motionCapture.stream.getVideoTracks();
        const label = 'Shared Screen';
        prepareMotionCaptureSession(label);
        motionCapture.activeSource = 'screen';
        ui.motionCaptureVideo.controls = false;
        ui.motionCaptureVideo.srcObject = motionCapture.stream;

        if (track) {
            track.addEventListener('ended', () => {
                if (motionCapture.stream?.getVideoTracks?.()[0] !== track) return;
                stopMotionCaptureSource({ preservePreview: false, preservePose: true });
            });
        }

        await ui.motionCaptureVideo.play();
        startMotionCaptureLoop();
        setStatus('Screen share connected. Pose tracking is live. Use Record in the capture window when you want to write frames into the timeline.', 'success');
    } catch (error) {
        console.error(error);
        setMotionCaptureStateLabel('Idle');
        setStatus(
            error?.name === 'NotAllowedError'
                ? 'Screen sharing was canceled or blocked.'
                : 'Could not start screen sharing for motion capture.',
            'error'
        );
    }
}

async function handleMotionCaptureVideoSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        await ensureMotionCaptureLandmarker();
        stopMotionCaptureSource({ preservePreview: false, preservePose: true, skipStatus: true });

        if (motionCapture.objectUrl) {
            URL.revokeObjectURL(motionCapture.objectUrl);
            motionCapture.objectUrl = '';
        }

        const label = file.name.replace(/\.[^.]+$/, '') || 'Uploaded video';
        prepareMotionCaptureSession(label);
        motionCapture.activeSource = 'upload';
        motionCapture.objectUrl = URL.createObjectURL(file);
        ui.motionCaptureVideo.controls = true;
        ui.motionCaptureVideo.srcObject = null;
        ui.motionCaptureVideo.src = motionCapture.objectUrl;
        ui.motionCaptureVideo.currentTime = 0;
        ui.animationNameInput.value = label;
        await ui.motionCaptureVideo.play();
        startMotionCaptureLoop();
        setStatus('Video loaded. Pose tracking is live. Press Record in the capture window when you want to capture timeline frames.', 'success');
    } catch (error) {
        console.error(error);
        setMotionCaptureStateLabel('Error');
        setStatus('Could not load the selected video for motion capture.', 'error');
    } finally {
        event.target.value = '';
    }
}

function stopMotionCaptureSource(options = {}) {
    if (motionCapture.animationFrameId) {
        cancelAnimationFrame(motionCapture.animationFrameId);
        motionCapture.animationFrameId = 0;
    }

    motionCapture.processing = false;
    motionCapture.latestLandmarks = [];
    motionCapture.lastProcessedVideoTime = -1;
    motionCapture.isRecording = false;
    motionCapture.recordStartTime = 0;
    motionCapture.screenTimelinePreview = false;
    motionCapture.syncingFromVideo = false;
    motionCapture.videoSeekingFromTimeline = false;
    motionCapture.sourceLabel = '';

    if (motionCapture.stream) {
        motionCapture.stream.getTracks().forEach(track => track.stop());
        motionCapture.stream = null;
    }

    if (ui.motionCaptureVideo) {
        ui.motionCaptureVideo.pause();
        ui.motionCaptureVideo.srcObject = null;
        if (motionCapture.objectUrl) {
            URL.revokeObjectURL(motionCapture.objectUrl);
            motionCapture.objectUrl = '';
        }
        ui.motionCaptureVideo.removeAttribute('src');
        ui.motionCaptureVideo.load();
    }

    motionCapture.activeSource = 'none';
    setMotionCaptureStateLabel('Idle');
    if (!options.preservePreview) {
        hideMotionCapturePreview();
    }
    clearMotionCaptureOverlay();

    if (!options.preservePose && motionCapture.basePose) {
        applyPoseState(clonePoseState(motionCapture.basePose));
    }

    if (!options.skipStatus) {
        setStatus('Motion capture source stopped.', 'info');
    }
    syncMotionCaptureTransportUi();
}

function startMotionCaptureLoop() {
    if (motionCapture.animationFrameId) return;

    const tick = async () => {
        motionCapture.animationFrameId = requestAnimationFrame(tick);
        await processMotionCaptureFrame();
    };

    motionCapture.animationFrameId = requestAnimationFrame(tick);
}

async function processMotionCaptureFrame() {
    if (motionCapture.processing || motionCapture.activeSource === 'none') return;
    if (!ui.motionCaptureVideo || ui.motionCaptureVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const sourceTime = Number.isFinite(ui.motionCaptureVideo.currentTime) ? ui.motionCaptureVideo.currentTime : 0;
    if (sourceTime === motionCapture.lastProcessedVideoTime) {
        return;
    }

    motionCapture.lastProcessedVideoTime = sourceTime;
    motionCapture.processing = true;

    try {
        const landmarker = await ensureMotionCaptureLandmarker();
        const result = landmarker.detectForVideo(ui.motionCaptureVideo, performance.now());
        const landmarks = Array.isArray(result?.landmarks?.[0]) ? result.landmarks[0] : null;
        const worldLandmarks = Array.isArray(result?.worldLandmarks?.[0]) ? result.worldLandmarks[0] : null;

        if (!landmarks || !worldLandmarks || !hasMotionCapturePoseLandmarks(landmarks)) {
            setMotionCaptureStateLabel('Searching');
            clearMotionCaptureOverlay();
            return;
        }

        motionCapture.latestLandmarks = landmarks;
        const targetPose = clonePoseState(motionCapture.currentPose || motionCapture.basePose || capturePose());
        const mapped = applyMotionCaptureLandmarksToPose(targetPose, landmarks, worldLandmarks, 0);
        drawMotionCaptureOverlay(landmarks);

        if (!mapped) {
            setMotionCaptureStateLabel('Searching');
            return;
        }

        motionCapture.currentPose = smoothMotionCapturePoseState(motionCapture.currentPose, targetPose, MOTION_CAPTURE_SMOOTHING);
        if (motionCapture.isRecording) {
            applyPoseState(motionCapture.currentPose);
            const recordTime = Math.max(0, sourceTime - motionCapture.recordStartTime);
            upsertMotionCaptureKeyframe(recordTime, motionCapture.currentPose);

            motionCapture.syncingFromVideo = true;
            setCurrentTime(roundTime(recordTime), { applyPose: false, syncVideo: false });
            motionCapture.syncingFromVideo = false;
            setMotionCaptureStateLabel('Recording');
        } else if (motionCapture.activeSource === 'screen' && motionCapture.screenTimelinePreview && keyframes.length > 0) {
            setMotionCaptureStateLabel(isPlaying ? 'Previewing' : 'Preview Ready');
        } else {
            applyPoseState(motionCapture.currentPose);
            setMotionCaptureStateLabel('Tracking');
        }
    } catch (error) {
        console.error(error);
        setMotionCaptureStateLabel('Error');
        setStatus('MediaPipe hit an error while processing the motion-capture source.', 'error');
    } finally {
        motionCapture.processing = false;
    }
}

function syncMotionCapturePlaybackState(forceSeek = false) {
    if (motionCapture.activeSource !== 'upload' || !ui.motionCaptureVideo || !ui.motionCaptureVideo.src) return;
    ui.motionCaptureVideo.playbackRate = playbackSpeed;

    if (isPlaying) {
        if (ui.motionCaptureVideo.paused) {
            ui.motionCaptureVideo.play().catch(() => {});
        }
    } else if (!ui.motionCaptureVideo.paused) {
        ui.motionCaptureVideo.pause();
    }

    syncMotionCapturePreviewToTimeline(forceSeek);
    syncMotionCaptureTransportUi();
}

function syncMotionCapturePreviewToTimeline(forceSeek = false) {
    if (motionCapture.activeSource !== 'upload' || motionCapture.syncingFromVideo) return;
    if (!ui.motionCaptureVideo || !ui.motionCaptureVideo.src || ui.motionCaptureVideo.readyState < HTMLMediaElement.HAVE_METADATA) return;

    const drift = Math.abs(ui.motionCaptureVideo.currentTime - currentTime);
    if (!isPlaying || forceSeek || drift > 0.12) {
        motionCapture.videoSeekingFromTimeline = true;
        ui.motionCaptureVideo.currentTime = currentTime;
        window.setTimeout(() => {
            motionCapture.videoSeekingFromTimeline = false;
        }, 0);
    }
}

function upsertMotionCaptureKeyframe(time, pose) {
    const roundedTime = roundTime(Math.max(0, time));
    const clonedPose = clonePoseState(pose);
    let keyframe = findKeyframeNearTime(roundedTime, 0.0001);

    if (keyframe) {
        keyframe.time = roundedTime;
        keyframe.pose = clonedPose;
    } else {
        keyframe = {
            id: nextKeyframeId,
            time: roundedTime,
            pose: clonedPose
        };
        nextKeyframeId += 1;
        keyframes.push(keyframe);
    }

    selectedKeyframeId = keyframe.id;
    sortKeyframes();
    ensureTimelineCovers(roundedTime);
}

function drawMotionCaptureOverlay(landmarks) {
    resizeMotionCaptureOverlay();
    const context = ui.motionCaptureOverlay.getContext('2d');
    const width = ui.motionCaptureOverlay.width;
    const height = ui.motionCaptureOverlay.height;
    context.clearRect(0, 0, width, height);

    const rect = getMotionCaptureContainedVideoRect(
        width,
        height,
        ui.motionCaptureVideo.videoWidth || 1,
        ui.motionCaptureVideo.videoHeight || 1
    );

    context.lineWidth = 3;
    context.lineCap = 'round';
    context.strokeStyle = 'rgba(56, 189, 248, 0.95)';
    context.fillStyle = 'rgba(125, 211, 252, 0.98)';
    context.shadowBlur = 14;
    context.shadowColor = 'rgba(56, 189, 248, 0.42)';

    MOTION_CAPTURE_CONNECTIONS.forEach(([startIndex, endIndex]) => {
        const start = landmarks[startIndex];
        const end = landmarks[endIndex];
        if (!isReliableMotionCaptureLandmark(start) || !isReliableMotionCaptureLandmark(end)) return;

        const startPoint = projectMotionCaptureLandmark(start, rect);
        const endPoint = projectMotionCaptureLandmark(end, rect);
        context.beginPath();
        context.moveTo(startPoint.x, startPoint.y);
        context.lineTo(endPoint.x, endPoint.y);
        context.stroke();
    });

    context.shadowBlur = 0;
    landmarks.forEach(landmark => {
        if (!isReliableMotionCaptureLandmark(landmark)) return;
        const point = projectMotionCaptureLandmark(landmark, rect);
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fill();
    });
}

function getMotionCaptureContainedVideoRect(canvasWidth, canvasHeight, videoWidth, videoHeight) {
    const canvasAspect = canvasWidth / canvasHeight;
    const videoAspect = videoWidth / videoHeight;

    if (!Number.isFinite(videoAspect) || videoAspect <= 0) {
        return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
    }

    if (videoAspect > canvasAspect) {
        const width = canvasWidth;
        const height = width / videoAspect;
        return { x: 0, y: (canvasHeight - height) / 2, width, height };
    }

    const height = canvasHeight;
    const width = height * videoAspect;
    return { x: (canvasWidth - width) / 2, y: 0, width, height };
}

function projectMotionCaptureLandmark(landmark, rect) {
    return {
        x: rect.x + landmark.x * rect.width,
        y: rect.y + landmark.y * rect.height
    };
}

function getMotionCaptureJointName(baseName, characterIndex = 0) {
    return `${baseName}_${characterIndex}`;
}

function getMotionCaptureCharacterBasePosition(characterIndex = 0) {
    const hipsName = getMotionCaptureJointName('Hips', characterIndex);
    const captured = motionCapture.basePose?.[hipsName]?.position;
    if (captured) return captured.clone();
    const characterRoot = characters[characterIndex];
    if (characterRoot?.position) return characterRoot.position.clone();
    return new THREE.Vector3(0, 2.6, 0);
}

function isReliableMotionCaptureLandmark(landmark) {
    return !!landmark && (landmark.visibility ?? 1) >= MOTION_CAPTURE_VISIBILITY;
}

function hasReliableMotionCapturePair(landmarks, firstIndex, secondIndex) {
    return isReliableMotionCaptureLandmark(landmarks[firstIndex]) && isReliableMotionCaptureLandmark(landmarks[secondIndex]);
}

function hasMotionCapturePoseLandmarks(landmarks) {
    return hasReliableMotionCapturePair(landmarks, MOTION_CAPTURE_LM.LEFT_SHOULDER, MOTION_CAPTURE_LM.RIGHT_SHOULDER)
        && hasReliableMotionCapturePair(landmarks, MOTION_CAPTURE_LM.LEFT_HIP, MOTION_CAPTURE_LM.RIGHT_HIP);
}

function toMotionCaptureWorldVector(landmark) {
    if (!landmark) return null;
    return new THREE.Vector3(landmark.x, -landmark.y, -landmark.z);
}

function getMotionCaptureReliableWorldCenter(world, landmarks, indices) {
    const center = new THREE.Vector3();
    let count = 0;

    indices.forEach(index => {
        if (!isReliableMotionCaptureLandmark(landmarks[index]) || !world[index]) return;
        center.add(world[index]);
        count += 1;
    });

    return count > 0 ? center.multiplyScalar(1 / count) : null;
}

function motionCaptureDirectionBetween(start, end) {
    if (!start || !end) return null;
    const direction = end.clone().sub(start);
    if (direction.lengthSq() < 1e-8) return null;
    return direction.normalize();
}

function motionCaptureAverageDirection(vectors) {
    const sum = new THREE.Vector3();
    let count = 0;

    vectors.forEach(vector => {
        if (!vector || vector.lengthSq() < 1e-8) return;
        sum.add(vector);
        count += 1;
    });

    return count > 0 && sum.lengthSq() > 1e-8 ? sum.normalize() : null;
}

function motionCaptureMidpointVector(a, b) {
    if (!a || !b) return null;
    return a.clone().add(b).multiplyScalar(0.5);
}

function motionCaptureLandmarkDirection(world, landmarks, startIndex, endIndex) {
    if (!isReliableMotionCaptureLandmark(landmarks[startIndex]) || !isReliableMotionCaptureLandmark(landmarks[endIndex])) {
        return null;
    }
    return motionCaptureDirectionBetween(world[startIndex], world[endIndex]);
}

function motionCaptureMidpointLandmark(a, b) {
    return {
        x: ((a?.x ?? 0) + (b?.x ?? 0)) * 0.5,
        y: ((a?.y ?? 0) + (b?.y ?? 0)) * 0.5
    };
}

function motionCaptureDistance2D(a, b) {
    if (!a || !b) return 0;
    return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

function motionCaptureQuaternionFromBasis(leftAxis, upAxis) {
    const yAxis = upAxis.clone().normalize();
    let xAxis = leftAxis.clone();
    xAxis.sub(yAxis.clone().multiplyScalar(xAxis.dot(yAxis)));

    if (xAxis.lengthSq() < 1e-8) {
        xAxis = Math.abs(yAxis.y) < 0.95
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(0, 0, 1);
        xAxis.sub(yAxis.clone().multiplyScalar(xAxis.dot(yAxis)));
    }

    if (xAxis.lengthSq() < 1e-8) {
        return new THREE.Quaternion();
    }

    xAxis.normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    const correctedXAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    const matrix = new THREE.Matrix4().makeBasis(correctedXAxis, yAxis, zAxis);
    return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

function getMotionCaptureWorldQuaternionMap(pose, characterIndex = 0) {
    const map = {};

    MOTION_CAPTURE_BASE_JOINT_ORDER.forEach(baseName => {
        const name = getMotionCaptureJointName(baseName, characterIndex);
        const parentBaseName = MOTION_CAPTURE_BASE_JOINT_PARENTS[baseName];
        const parentName = parentBaseName ? getMotionCaptureJointName(parentBaseName, characterIndex) : null;
        if (!pose[name]) return;
        map[name] = parentName && map[parentName]
            ? map[parentName].clone().multiply(pose[name].quaternion)
            : pose[name].quaternion.clone();
    });

    return map;
}

function setMotionCaptureWorldQuaternionOnPose(pose, worldQuaternionMap, jointName, worldQuaternion) {
    const baseName = jointName.replace(/_[0-9]+$/, '');
    const parentBaseName = MOTION_CAPTURE_BASE_JOINT_PARENTS[baseName];
    const parentName = parentBaseName ? getMotionCaptureJointName(parentBaseName, 0) : null;

    if (!pose[jointName]) return;

    if (parentName && worldQuaternionMap[parentName]) {
        pose[jointName].quaternion.copy(worldQuaternionMap[parentName].clone().invert().multiply(worldQuaternion)).normalize();
    } else {
        pose[jointName].quaternion.copy(worldQuaternion).normalize();
    }

    worldQuaternionMap[jointName] = worldQuaternion.clone();
}

function applyMotionCaptureLimbDirection(pose, worldQuaternionMap, jointName, direction) {
    if (!direction) return;
    const worldQuaternion = new THREE.Quaternion().setFromUnitVectors(MOTION_CAPTURE_DOWN_AXIS, direction);
    setMotionCaptureWorldQuaternionOnPose(pose, worldQuaternionMap, jointName, worldQuaternion);
}

function computeMotionCaptureRootPosition(landmarks, characterIndex = 0) {
    const rootPosition = getMotionCaptureCharacterBasePosition(characterIndex);
    const leftHip = landmarks[MOTION_CAPTURE_LM.LEFT_HIP];
    const rightHip = landmarks[MOTION_CAPTURE_LM.RIGHT_HIP];
    const leftShoulder = landmarks[MOTION_CAPTURE_LM.LEFT_SHOULDER];
    const rightShoulder = landmarks[MOTION_CAPTURE_LM.RIGHT_SHOULDER];

    if (!leftHip || !rightHip || !leftShoulder || !rightShoulder) {
        return rootPosition;
    }

    const hipCenter = motionCaptureMidpointLandmark(leftHip, rightHip);
    const shoulderSpan = motionCaptureDistance2D(leftShoulder, rightShoulder);

    if (!motionCapture.rootBaseline) {
        motionCapture.rootBaseline = {
            x: hipCenter.x,
            y: hipCenter.y,
            shoulderSpan: shoulderSpan || 0.2,
            origin: rootPosition.clone()
        };
    }

    const baseline = motionCapture.rootBaseline;
    const deltaX = (hipCenter.x - baseline.x) * 8;
    const deltaY = (baseline.y - hipCenter.y) * 10;
    const depthDelta = (shoulderSpan - baseline.shoulderSpan) * 9;

    rootPosition.x = THREE.MathUtils.clamp(baseline.origin.x + deltaX, -MOTION_CAPTURE_ROOT_XZ_LIMIT, MOTION_CAPTURE_ROOT_XZ_LIMIT);
    rootPosition.y = THREE.MathUtils.clamp(baseline.origin.y + deltaY, MOTION_CAPTURE_ROOT_Y_MIN, MOTION_CAPTURE_ROOT_Y_MAX);
    rootPosition.z = THREE.MathUtils.clamp(baseline.origin.z + depthDelta, -MOTION_CAPTURE_ROOT_Z_LIMIT, MOTION_CAPTURE_ROOT_Z_LIMIT);
    return rootPosition;
}

function smoothMotionCapturePoseState(previousPose, nextPose, smoothing) {
    if (!previousPose) {
        return clonePoseState(nextPose);
    }

    const alpha = THREE.MathUtils.clamp(1 - smoothing, 0.05, 1);
    const pose = clonePoseState(previousPose);

    Object.entries(nextPose).forEach(([name, transform]) => {
        if (!transform?.position || !transform?.quaternion) return;
        if (!pose[name]) {
            pose[name] = {
                position: transform.position.clone(),
                quaternion: transform.quaternion.clone(),
                scale: transform.scale?.clone() ?? null
            };
            return;
        }

        pose[name].position.lerp(transform.position, alpha);
        pose[name].quaternion.slerp(transform.quaternion, alpha).normalize();
    });

    return pose;
}

function applyMotionCaptureLandmarksToPose(pose, landmarks, worldLandmarks, characterIndex = 0) {
    if (!characters[characterIndex] || !hasMotionCapturePoseLandmarks(landmarks)) return false;

    const joint = baseName => getMotionCaptureJointName(baseName, characterIndex);
    const requiredJoints = MOTION_CAPTURE_BASE_JOINT_ORDER.map(baseName => joint(baseName));
    if (requiredJoints.some(name => !pose[name])) return false;

    const world = worldLandmarks.map(toMotionCaptureWorldVector);
    const worldQuaternionMap = getMotionCaptureWorldQuaternionMap(pose, characterIndex);
    const hipsCenter = getMotionCaptureReliableWorldCenter(world, landmarks, [MOTION_CAPTURE_LM.LEFT_HIP, MOTION_CAPTURE_LM.RIGHT_HIP]);
    const shouldersCenter = getMotionCaptureReliableWorldCenter(world, landmarks, [MOTION_CAPTURE_LM.LEFT_SHOULDER, MOTION_CAPTURE_LM.RIGHT_SHOULDER])
        || new THREE.Vector3(0, 1, 0);
    const torsoUp = hipsCenter ? motionCaptureDirectionBetween(hipsCenter, shouldersCenter) : null;
    const bodyLeft = motionCaptureAverageDirection([
        motionCaptureDirectionBetween(world[MOTION_CAPTURE_LM.RIGHT_HIP], world[MOTION_CAPTURE_LM.LEFT_HIP]),
        motionCaptureDirectionBetween(world[MOTION_CAPTURE_LM.RIGHT_SHOULDER], world[MOTION_CAPTURE_LM.LEFT_SHOULDER]),
        new THREE.Vector3(1, 0, 0)
    ]);

    if (!torsoUp || !bodyLeft) return false;

    const hipsWorldQuaternion = motionCaptureQuaternionFromBasis(bodyLeft, torsoUp);
    setMotionCaptureWorldQuaternionOnPose(pose, worldQuaternionMap, joint('Hips'), hipsWorldQuaternion);
    setMotionCaptureWorldQuaternionOnPose(pose, worldQuaternionMap, joint('Spine'), hipsWorldQuaternion);

    const headLeft = motionCaptureAverageDirection([
        motionCaptureDirectionBetween(world[MOTION_CAPTURE_LM.RIGHT_EAR], world[MOTION_CAPTURE_LM.LEFT_EAR]),
        motionCaptureDirectionBetween(world[MOTION_CAPTURE_LM.RIGHT_SHOULDER], world[MOTION_CAPTURE_LM.LEFT_SHOULDER])
    ]);
    const headUp = motionCaptureAverageDirection([
        motionCaptureDirectionBetween(shouldersCenter, world[MOTION_CAPTURE_LM.NOSE]),
        torsoUp,
        motionCaptureDirectionBetween(shouldersCenter, motionCaptureMidpointVector(world[MOTION_CAPTURE_LM.LEFT_EAR], world[MOTION_CAPTURE_LM.RIGHT_EAR]))
    ]);

    if (headLeft && headUp) {
        const headWorldQuaternion = motionCaptureQuaternionFromBasis(headLeft, headUp);
        setMotionCaptureWorldQuaternionOnPose(pose, worldQuaternionMap, joint('Head'), headWorldQuaternion);
    }

    applyMotionCaptureLimbDirection(pose, worldQuaternionMap, joint('Left_Upper_Arm'), motionCaptureLandmarkDirection(world, landmarks, MOTION_CAPTURE_LM.LEFT_SHOULDER, MOTION_CAPTURE_LM.LEFT_ELBOW));
    applyMotionCaptureLimbDirection(pose, worldQuaternionMap, joint('Left_Lower_Arm'), motionCaptureLandmarkDirection(world, landmarks, MOTION_CAPTURE_LM.LEFT_ELBOW, MOTION_CAPTURE_LM.LEFT_WRIST));
    applyMotionCaptureLimbDirection(pose, worldQuaternionMap, joint('Right_Upper_Arm'), motionCaptureLandmarkDirection(world, landmarks, MOTION_CAPTURE_LM.RIGHT_SHOULDER, MOTION_CAPTURE_LM.RIGHT_ELBOW));
    applyMotionCaptureLimbDirection(pose, worldQuaternionMap, joint('Right_Lower_Arm'), motionCaptureLandmarkDirection(world, landmarks, MOTION_CAPTURE_LM.RIGHT_ELBOW, MOTION_CAPTURE_LM.RIGHT_WRIST));
    applyMotionCaptureLimbDirection(pose, worldQuaternionMap, joint('Left_Upper_Leg'), motionCaptureLandmarkDirection(world, landmarks, MOTION_CAPTURE_LM.LEFT_HIP, MOTION_CAPTURE_LM.LEFT_KNEE));
    applyMotionCaptureLimbDirection(pose, worldQuaternionMap, joint('Left_Lower_Leg'), motionCaptureLandmarkDirection(world, landmarks, MOTION_CAPTURE_LM.LEFT_KNEE, MOTION_CAPTURE_LM.LEFT_ANKLE));
    applyMotionCaptureLimbDirection(pose, worldQuaternionMap, joint('Right_Upper_Leg'), motionCaptureLandmarkDirection(world, landmarks, MOTION_CAPTURE_LM.RIGHT_HIP, MOTION_CAPTURE_LM.RIGHT_KNEE));
    applyMotionCaptureLimbDirection(pose, worldQuaternionMap, joint('Right_Lower_Leg'), motionCaptureLandmarkDirection(world, landmarks, MOTION_CAPTURE_LM.RIGHT_KNEE, MOTION_CAPTURE_LM.RIGHT_ANKLE));

    pose[joint('Hips')].position.copy(computeMotionCaptureRootPosition(landmarks, characterIndex));
    return true;
}

// Purpose: pose capture/application and transform-control driven posing behavior.

function handleTransformObjectChange() {
    if (selectedReferenceCube) return;

    if (selectedWeapon) {
        syncWeaponDimensionsFromScale(selectedWeapon);
        syncWeaponControls();
        handlePoseEdited();
        return;
    }

    applyPullTranslation();
    handlePoseEdited();
}

function handlePoseEdited() {
    if (isPlaying || selectedKeyframeId === null) return;

    const keyframe = findKeyframeById(selectedKeyframeId);
    if (!keyframe) return;

    keyframe.pose = capturePose();
    keyframe.time = clampKeyframeTime(currentTime, keyframe.id);
    sortKeyframes();
    currentTime = keyframe.time;
    refreshTimelineUi();
}

function capturePose() {
    const pose = {};
    characters.forEach(charRoot => {
        charRoot.traverse(obj => {
            if (obj.isGroup && obj.userData.isJoint) {
                pose[obj.name] = {
                    position: obj.position.clone(),
                    quaternion: obj.quaternion.clone(),
                    scale: obj.scale.clone()
                };
            }
        });
    });
    weapons.forEach(weapon => {
        pose[getWeaponPoseKey(weapon)] = {
            position: weapon.position.clone(),
            quaternion: weapon.quaternion.clone(),
            scale: weapon.scale.clone()
        };
    });
    return pose;
}

function clonePoseState(pose) {
    const cloned = {};

    Object.entries(pose || {}).forEach(([name, transform]) => {
        if (!transform?.position || !transform?.quaternion) return;
        cloned[name] = {
            position: transform.position.clone(),
            quaternion: transform.quaternion.clone(),
            scale: transform.scale?.clone() ?? null
        };
    });

    return cloned;
}

function applyPoseState(pose) {
    if (!pose) return;

    characters.forEach(charRoot => {
        charRoot.traverse(obj => {
            if (!obj.isGroup || !obj.userData.isJoint || !pose[obj.name]) return;
            obj.position.copy(pose[obj.name].position);
            obj.quaternion.copy(pose[obj.name].quaternion);
            if (pose[obj.name].scale) {
                obj.scale.copy(pose[obj.name].scale);
            }
        });
    });

    weapons.forEach(weapon => {
        const transform = pose[getWeaponPoseKey(weapon)];
        if (!transform) return;

        weapon.position.copy(transform.position);
        weapon.quaternion.copy(transform.quaternion);
        if (transform.scale) {
            weapon.scale.copy(transform.scale);
            syncWeaponDimensionsFromScale(weapon);
        }
    });

    syncTransformAttachment();
    syncActorDimensionControls();
    syncWeaponControls();
}

function getCurrentTransformMode() {
    return typeof transformControl?.getMode === 'function'
        ? transformControl.getMode()
        : transformControl?.mode;
}

function isTransformControlAxisActive() {
    return transformControl?.axis !== null && transformControl?.axis !== undefined;
}

function getCharacterRootFromJoint(joint) {
    let current = joint;
    while (current?.parent && current.parent !== scene) {
        current = current.parent;
    }
    return characters.includes(current) ? current : null;
}

function getPullJointName(joint) {
    return joint?.name?.replace(/_[0-9]+$/, '') ?? '';
}

function getPullChain(selected, characterRoot) {
    const chain = [];
    let current = selected?.parent ?? null;

    while (current && current !== scene) {
        if (current.isGroup) {
            chain.push(current);
        }

        if (current === characterRoot) {
            break;
        }

        current = current.parent ?? null;
    }

    return chain;
}

function getChainInfluence(index) {
    const weights = [0.78, 0.52, 0.33, 0.22];
    if (index < weights.length) return weights[index];
    return Math.max(0.14, weights[weights.length - 1] * Math.pow(0.78, index - weights.length + 1));
}

function getRootFollowAmount(joint) {
    const jointName = getPullJointName(joint);

    if (jointName.includes('Arm')) {
        return { xz: 0.34, y: 0.18 };
    }

    if (jointName.includes('Head') || jointName.includes('Spine')) {
        return { xz: 0.3, y: 0.16 };
    }

    if (jointName.includes('Leg')) {
        return { xz: 0.2, y: 0.1 };
    }

    return { xz: 0.26, y: 0.12 };
}

function syncTranslationHandleToJoint() {
    if (!translationHandle || !selectedJoint) return;

    selectedJoint.getWorldPosition(tempSelectedJointWorldPosition);
    translationHandle.position.copy(tempSelectedJointWorldPosition);
    translationHandle.quaternion.identity();
    translationHandle.scale.set(1, 1, 1);
    translationHandle.updateMatrixWorld(true);
}

function syncTransformAttachment() {
    if (!transformControl) return;

    if (selectedReferenceCube) {
        if (transformControl.object !== selectedReferenceCube) {
            transformControl.attach(selectedReferenceCube);
        }
        return;
    }

    if (selectedWeapon) {
        if (transformControl.object !== selectedWeapon) {
            transformControl.attach(selectedWeapon);
        }
        return;
    }

    if (!selectedJoint) {
        if (transformControl.object) {
            transformControl.detach();
        }
        return;
    }

    if (getCurrentTransformMode() === 'translate') {
        syncTranslationHandleToJoint();
        if (transformControl.object !== translationHandle) {
            transformControl.attach(translationHandle);
        }
        return;
    }

    if (transformControl.object !== selectedJoint) {
        transformControl.attach(selectedJoint);
    }
}

function beginPullDrag() {
    if (getCurrentTransformMode() !== 'translate' || transformControl.object !== translationHandle || !selectedJoint) {
        pullDragState.active = false;
        pullDragState.characterRoot = null;
        pullDragState.jointChain = [];
        return;
    }

    const characterRoot = getCharacterRootFromJoint(selectedJoint);
    if (!characterRoot) {
        pullDragState.active = false;
        pullDragState.characterRoot = null;
        pullDragState.jointChain = [];
        return;
    }

    syncTranslationHandleToJoint();
    pullDragState.active = true;
    pullDragState.characterRoot = characterRoot;
    pullDragState.jointChain = getPullChain(selectedJoint, characterRoot);
}

function applyPullTranslation() {
    if (!pullDragState.active || !pullDragState.characterRoot || transformControl.object !== translationHandle) return;

    translationHandle.getWorldPosition(tempHandleWorldPosition);
    selectedJoint.getWorldPosition(tempSelectedJointWorldPosition);
    tempPullDelta.subVectors(tempHandleWorldPosition, tempSelectedJointWorldPosition);

    if (tempPullDelta.lengthSq() <= 1e-8) return;

    // Approximate a physical pull by rotating the parent chain toward the target,
    // then letting the hips follow a little to absorb the remaining stretch.
    for (let iteration = 0; iteration < 3; iteration += 1) {
        for (let index = 0; index < pullDragState.jointChain.length; index += 1) {
            const ancestor = pullDragState.jointChain[index];
            ancestor.getWorldPosition(tempAncestorWorldPosition);
            selectedJoint.getWorldPosition(tempSelectedJointWorldPosition);

            tempCurrentDirection.subVectors(tempSelectedJointWorldPosition, tempAncestorWorldPosition);
            tempTargetDirection.subVectors(tempHandleWorldPosition, tempAncestorWorldPosition);

            const currentLengthSq = tempCurrentDirection.lengthSq();
            const targetLengthSq = tempTargetDirection.lengthSq();
            if (currentLengthSq <= 1e-8 || targetLengthSq <= 1e-8) {
                continue;
            }

            tempCurrentDirection.normalize();
            tempTargetDirection.normalize();
            tempWorldDeltaQuaternion.setFromUnitVectors(tempCurrentDirection, tempTargetDirection);

            const axisLength = Math.sqrt(
                tempWorldDeltaQuaternion.x * tempWorldDeltaQuaternion.x +
                tempWorldDeltaQuaternion.y * tempWorldDeltaQuaternion.y +
                tempWorldDeltaQuaternion.z * tempWorldDeltaQuaternion.z
            );

            if (axisLength <= 1e-6) {
                continue;
            }

            tempWorldAxis.set(
                tempWorldDeltaQuaternion.x / axisLength,
                tempWorldDeltaQuaternion.y / axisLength,
                tempWorldDeltaQuaternion.z / axisLength
            );

            const unclampedAngle = 2 * Math.atan2(axisLength, tempWorldDeltaQuaternion.w);
            const weightedAngle = Math.min(0.22, unclampedAngle * getChainInfluence(index));
            if (!Number.isFinite(weightedAngle) || weightedAngle <= 1e-5) {
                continue;
            }

            tempWorldDeltaQuaternion.setFromAxisAngle(tempWorldAxis, weightedAngle);
            ancestor.parent?.getWorldQuaternion(tempParentWorldQuaternion);
            tempParentWorldQuaternionInverse.copy(tempParentWorldQuaternion).invert();
            tempLocalDeltaQuaternion.copy(tempParentWorldQuaternionInverse);
            tempLocalDeltaQuaternion.multiply(tempWorldDeltaQuaternion);
            tempLocalDeltaQuaternion.multiply(tempParentWorldQuaternion);
            ancestor.quaternion.premultiply(tempLocalDeltaQuaternion).normalize();
            ancestor.updateMatrixWorld(true);
        }
    }

    selectedJoint.getWorldPosition(tempSelectedJointWorldPosition);
    tempPullResidual.subVectors(tempHandleWorldPosition, tempSelectedJointWorldPosition);

    if (tempPullResidual.lengthSq() <= 1e-8) {
        return;
    }

    const rootFollow = getRootFollowAmount(selectedJoint);
    tempPullDelta.set(
        tempPullResidual.x * rootFollow.xz,
        tempPullResidual.y * rootFollow.y,
        tempPullResidual.z * rootFollow.xz
    );

    if (selectedJoint === pullDragState.characterRoot) {
        tempPullDelta.copy(tempPullResidual);
    }

    pullDragState.characterRoot.position.add(tempPullDelta);
    pullDragState.characterRoot.updateMatrixWorld(true);
}

function endPullDrag() {
    if (!pullDragState.active) return;

    pullDragState.active = false;
    pullDragState.characterRoot = null;
    pullDragState.jointChain = [];
    syncTranslationHandleToJoint();
}

function interpolatePoseStates(poseA, poseB, alpha) {

// Purpose: keyframe editing, playback state, and timeline interaction logic.

    const blended = {};
    const jointNames = new Set([ ...Object.keys(poseA || {}), ...Object.keys(poseB || {}) ]);

    jointNames.forEach(name => {
        if (poseA?.[name] && poseB?.[name]) {
            blended[name] = {
                position: poseA[name].position.clone().lerp(poseB[name].position, alpha),
                quaternion: poseA[name].quaternion.clone().slerp(poseB[name].quaternion, alpha),
                scale: poseA[name].scale && poseB[name].scale
                    ? poseA[name].scale.clone().lerp(poseB[name].scale, alpha)
                    : poseA[name].scale?.clone() ?? poseB[name].scale?.clone() ?? null
            };
        } else if (poseA?.[name]) {
            blended[name] = {
                position: poseA[name].position.clone(),
                quaternion: poseA[name].quaternion.clone(),
                scale: poseA[name].scale?.clone() ?? null
            };
        } else if (poseB?.[name]) {
            blended[name] = {
                position: poseB[name].position.clone(),
                quaternion: poseB[name].quaternion.clone(),
                scale: poseB[name].scale?.clone() ?? null
            };
        }
    });

    return blended;
}

function getPoseStateAtTime(time) {
    if (keyframes.length === 0) {
        return null;
    }

    sortKeyframes();

    if (keyframes.length === 1 || time <= keyframes[0].time) {
        return clonePoseState(keyframes[0].pose);
    }

    const endKeyframe = keyframes[keyframes.length - 1];
    if (time >= endKeyframe.time) {
        return clonePoseState(endKeyframe.pose);
    }

    for (let index = 0; index < keyframes.length - 1; index += 1) {
        const startFrame = keyframes[index];
        const endFrame = keyframes[index + 1];

        if (time >= startFrame.time && time <= endFrame.time) {
            const segmentDuration = endFrame.time - startFrame.time;
            const alpha = segmentDuration <= 0 ? 0 : (time - startFrame.time) / segmentDuration;
            return interpolatePoseStates(startFrame.pose, endFrame.pose, alpha);
        }
    }

    return clonePoseState(endKeyframe.pose);
}

function applyPoseAtTime(time) {
    const pose = getPoseStateAtTime(time);
    if (pose) {
        applyPoseState(pose);
    }
    applyAnimationEffectsState(time);
}

function recordKeyframeAtCurrentTime() {
    if (isPlaying) stopPlayback();

    const time = roundTime(currentTime);
    const pose = capturePose();
    let keyframe = findKeyframeById(selectedKeyframeId);
    const nearbyKeyframe = findKeyframeNearTime(time);

    if (keyframe && Math.abs(keyframe.time - time) <= KEYFRAME_SNAP_TOLERANCE) {
        keyframe.pose = pose;
        keyframe.time = time;
    } else if (nearbyKeyframe) {
        keyframe = nearbyKeyframe;
        keyframe.pose = pose;
    } else {
        keyframe = {
            id: nextKeyframeId,
            time,
            pose
        };
        nextKeyframeId += 1;
        keyframes.push(keyframe);
    }

    selectedKeyframeId = keyframe.id;
    sortKeyframes();
    setCurrentTime(keyframe.time, { applyPose: false });
}

function deleteSelectedKeyframe() {
    if (selectedKeyframeId === null) return;

    const index = keyframes.findIndex(frame => frame.id === selectedKeyframeId);
    if (index === -1) {
        selectedKeyframeId = null;
        refreshTimelineUi();
        return;
    }

    keyframes.splice(index, 1);

    if (keyframes.length === 0) {
        selectedKeyframeId = null;
        currentTime = 0;
        resetClipRange();
        setAnimationEffects(null);
        stopPlayback();
        timelineViewDuration = TIMELINE_MIN_DURATION;
        refreshTimelineUi();
        return;
    }

    clampClipRangeToAnimation();
    const replacement = keyframes[Math.min(index, keyframes.length - 1)];
    selectedKeyframeId = replacement?.id ?? null;
    setCurrentTime(replacement ? replacement.time : 0);
}

function clearKeyframes() {
    keyframes.length = 0;
    selectedKeyframeId = null;
    currentTime = 0;
    nextKeyframeId = 1;
    pointerState = null;
    timelineViewDuration = TIMELINE_MIN_DURATION;
    resetClipRange();
    setAnimationEffects(null);
    stopPlayback();
    syncMotionCapturePlaybackState(true);
    refreshTimelineUi();
}

function togglePlay() {
    if (isPlaying) {
        stopPlayback();
        return;
    }

    if (keyframes.length < 2) return;

    deselect();
    if (currentTime >= getAnimationEndTime()) {
        currentTime = 0;
    }

    isPlaying = true;
    syncMotionCapturePlaybackState(true);
    refreshTimelineUi();
}

function stopPlayback() {
    if (!isPlaying) {
        updatePlayButton();
        syncMotionCapturePlaybackState();
        return;
    }

    isPlaying = false;
    updatePlayButton();
    syncMotionCapturePlaybackState();
}

function commitTimeInput() {
    const nextTime = Number.parseFloat(ui.timeInput.value);
    if (!Number.isFinite(nextTime)) {
        refreshTimelineUi();
        return;
    }

    setCurrentTime(nextTime);
}

function handleTimelinePointerDown(event) {
    if (event.button !== 0) return;

    event.preventDefault();
    if (isPlaying) stopPlayback();

    selectedKeyframeId = null;
    pointerState = {
        type: 'scrub',
        pointerId: event.pointerId
    };

    setCurrentTime(getTimeFromClientX(event.clientX));
}

function handleClipHandlePointerDown(event, handle) {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    if (isPlaying) stopPlayback();

    pointerState = {
        type: 'clip-handle',
        pointerId: event.pointerId,
        handle
    };
}

function handleMarkerPointerDown(event, keyframeId) {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    if (isPlaying) stopPlayback();

    selectedKeyframeId = keyframeId;
    pointerState = {
        type: 'marker',
        pointerId: event.pointerId,
        keyframeId
    };

    const keyframe = findKeyframeById(keyframeId);
    if (keyframe) {
        setCurrentTime(keyframe.time);
    } else {
        refreshTimelineUi();
    }
}

function handleGlobalPointerMove(event) {
    updateMotionCapturePanelDrag(event);
    if (!pointerState || pointerState.pointerId !== event.pointerId) return;

    if (pointerState.type === 'scrub') {
        setCurrentTime(getTimeFromClientX(event.clientX));
        return;
    }

    if (pointerState.type === 'marker') {
        const keyframe = findKeyframeById(pointerState.keyframeId);
        if (!keyframe) return;

        const nextTime = clampKeyframeTime(getTimeFromClientX(event.clientX), keyframe.id);
        keyframe.time = nextTime;
        sortKeyframes();
        selectedKeyframeId = keyframe.id;
        setCurrentTime(nextTime);
        return;
    }

    if (pointerState.type === 'clip-handle') {
        const nextTime = getTimeFromClientX(event.clientX);
        if (pointerState.handle === 'start') {
            clipRange.start = THREE.MathUtils.clamp(roundTime(nextTime), 0, clipRange.end);
        } else {
            clipRange.end = THREE.MathUtils.clamp(roundTime(nextTime), clipRange.start, getAnimationEndTime());
        }
        refreshTimelineUi();
    }
}

function handleGlobalPointerUp(event) {
    endMotionCapturePanelDrag(event);
    if (!pointerState || pointerState.pointerId !== event.pointerId) return;
    pointerState = null;
}

function findKeyframeById(id) {
    return keyframes.find(frame => frame.id === id) ?? null;
}

function findKeyframeNearTime(time, tolerance = KEYFRAME_SNAP_TOLERANCE) {
    let bestMatch = null;

    keyframes.forEach(frame => {
        if (Math.abs(frame.time - time) > tolerance) return;
        if (!bestMatch || Math.abs(frame.time - time) < Math.abs(bestMatch.time - time)) {
            bestMatch = frame;
        }
    });

    return bestMatch;
}

function sortKeyframes() {
    keyframes.sort((a, b) => a.time - b.time || a.id - b.id);
}

function getAnimationEndTime() {
    if (keyframes.length === 0) return 0;
    sortKeyframes();
    return keyframes[keyframes.length - 1].time;
}

function resetClipRange() {
    const endTime = getAnimationEndTime();
    clipRange.start = 0;
    clipRange.end = endTime;
}

function clampClipRangeToAnimation() {
    const endTime = getAnimationEndTime();
    if (endTime <= 0) {
        clipRange.start = 0;
        clipRange.end = 0;
        return;
    }

    clipRange.start = THREE.MathUtils.clamp(roundTime(clipRange.start), 0, endTime);
    const currentEnd = Number.isFinite(clipRange.end) ? clipRange.end : endTime;
    clipRange.end = THREE.MathUtils.clamp(roundTime(currentEnd), clipRange.start, endTime);
}

function clipAnimationToSelection() {
    if (keyframes.length === 0) {
        setStatus('Load or record an animation before clipping it.', 'error');
        return;
    }

    stopPlayback();
    pointerState = null;

    clampClipRangeToAnimation();

    const startTime = clipRange.start;
    const endTime = clipRange.end;
    const duration = roundTime(Math.max(0, endTime - startTime));
    const startPose = getPoseStateAtTime(startTime);

    if (!startPose) {
        setStatus('The clip interval could not be sampled.', 'error');
        return;
    }

    const frameMap = new Map();
    const storeFrame = (time, pose) => {
        const roundedTime = roundTime(time);
        frameMap.set(roundedTime.toFixed(1), {
            time: roundedTime,
            pose: clonePoseState(pose)
        });
    };

    storeFrame(0, startPose);

    keyframes.forEach(frame => {
        if (frame.time > startTime && frame.time < endTime) {
            storeFrame(frame.time - startTime, frame.pose);
        }
    });

    if (duration > 0) {
        const endPose = getPoseStateAtTime(endTime);
        if (endPose) {
            storeFrame(duration, endPose);
        }
    }

    const nextFrames = Array.from(frameMap.values())
        .sort((a, b) => a.time - b.time)
        .map((frame, index) => ({
            id: index + 1,
            time: frame.time,
            pose: frame.pose
        }));

    keyframes.length = 0;
    nextFrames.forEach(frame => keyframes.push(frame));
    selectedKeyframeId = keyframes[0]?.id ?? null;
    nextKeyframeId = keyframes.length + 1;
    timelineViewDuration = Math.max(TIMELINE_MIN_DURATION, roundUpTime(getAnimationEndTime() + 0.5));

    const clippedEffects = clipAnimationEffects(activeAnimationEffects, startTime, endTime);
    resetClipRange();
    setAnimationEffects(clippedEffects);
    setCurrentTime(0);
    setStatus(`Animation clipped to ${formatTime(startTime)}-${formatTime(endTime)} and shifted to start at 0.0s.`, 'success');
}

function getTimelineDuration() {
    return Math.max(
        TIMELINE_MIN_DURATION,
        timelineViewDuration,
        roundUpTime(getAnimationEndTime() + 0.5),
        roundUpTime(currentTime + 0.5)
    );
}

function ensureTimelineCovers(time) {
    timelineViewDuration = Math.max(TIMELINE_MIN_DURATION, roundUpTime(time + 0.5));
}

function getTimeFromClientX(clientX) {
    const rect = ui.timelineWorkarea.getBoundingClientRect();
    const ratio = rect.width <= 0 ? 0 : THREE.MathUtils.clamp((clientX - rect.left) / rect.width, 0, 1);
    return roundTime(ratio * getTimelineDuration());
}

function clampTime(time) {
    return THREE.MathUtils.clamp(roundTime(time), 0, getTimelineDuration());
}

function clampKeyframeTime(time, keyframeId) {
    const sortedFrames = [ ...keyframes ].sort((a, b) => a.time - b.time || a.id - b.id);
    const index = sortedFrames.findIndex(frame => frame.id === keyframeId);
    const previous = index > 0 ? sortedFrames[index - 1] : null;
    const next = index >= 0 && index < sortedFrames.length - 1 ? sortedFrames[index + 1] : null;
    const minTime = previous ? previous.time + MIN_KEYFRAME_GAP : 0;
    const maxTime = next ? next.time - MIN_KEYFRAME_GAP : getTimelineDuration();
    const safeMax = Math.max(minTime, maxTime);

    return roundTime(THREE.MathUtils.clamp(time, minTime, safeMax));
}

function setMode(mode) {
    endPullDrag();
    transformControl.setMode(mode);
    transformControl.setSpace(mode === 'translate' ? 'world' : 'local');
    syncTransformAttachment();
    if (mode === 'rotate') {
        ui.modeRotateBtn.className = MODE_ACTIVE_BUTTON_CLASS;
        ui.modeTranslateBtn.className = MODE_INACTIVE_BUTTON_CLASS;
    } else {
        ui.modeTranslateBtn.className = MODE_ACTIVE_BUTTON_CLASS;
        ui.modeRotateBtn.className = MODE_INACTIVE_BUTTON_CLASS;
    }
}

function resetPullDragState() {
    pullDragState.active = false;
    pullDragState.characterRoot = null;
    pullDragState.jointChain = [];
}

// Purpose: selection, characters, weapons, reference cubes, and scene entity lifecycle.

function setSelectedMeshEmissive(mesh, color) {
    const materials = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
    materials.forEach(material => {
        material?.emissive?.setHex?.(color);
    });
}

function removeInteractableObject(object) {
    const index = interactables.indexOf(object);
    if (index !== -1) {
        interactables.splice(index, 1);
    }
}

function disposeRenderable(object) {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) {
        object.material.forEach(material => material?.dispose?.());
    } else {
        object.material?.dispose?.();
    }
}

function selectInteractable(mesh) {
    if (mesh.userData.referenceCube) {
        selectReferenceCube(mesh.userData.referenceCube);
        return;
    }

    if (mesh.userData.weapon) {
        selectWeapon(mesh.userData.weapon);
        return;
    }

    if (mesh.userData.joint) {
        selectJoint(mesh);
    }
}

function getReferenceCubeDisplayName(cube) {
    return cube.name.replace(/^Reference_Cube_/, 'Reference cube ').replace(/_/g, ' ');
}

function selectReferenceCube(cube) {
    if (selectedMesh) {
        setSelectedMeshEmissive(selectedMesh, 0x000000);
    }

    selectedMesh = cube.userData.mesh;
    selectedJoint = null;
    selectedReferenceCube = cube;
    selectedWeapon = null;
    resetPullDragState();
    setSelectedMeshEmissive(selectedMesh, 0x164e63);

    syncTransformAttachment();
    syncReferenceCubeControls();
    syncWeaponControls();
    syncActorDimensionControls();

    ui.selectionInfo.classList.remove('hidden');
    ui.selectedName.innerText = getReferenceCubeDisplayName(cube);
}

function clampReferenceCubeSize(value) {
    return THREE.MathUtils.clamp(value, REFERENCE_CUBE_MIN_SIZE, REFERENCE_CUBE_MAX_SIZE);
}

function readReferenceCubeDimension(input, fallback) {
    const value = Number.parseFloat(input.value);
    return Number.isFinite(value) ? clampReferenceCubeSize(value) : fallback;
}

function formatReferenceCubeDimension(value) {
    return Number.parseFloat(value.toFixed(2)).toString();
}

function syncReferenceCubeControls() {
    if (!ui.referenceCubePanel) return;

    if (!selectedReferenceCube) {
        ui.referenceCubePanel.classList.add('hidden');
        return;
    }

    const dimensions = selectedReferenceCube.userData.dimensions;
    ui.referenceCubePanel.classList.remove('hidden');
    ui.cubeWidthInput.value = formatReferenceCubeDimension(dimensions.width);
    ui.cubeHeightInput.value = formatReferenceCubeDimension(dimensions.height);
    ui.cubeDepthInput.value = formatReferenceCubeDimension(dimensions.depth);
}

function getActorDisplayName(character) {
    const actorIndex = characters.indexOf(character) + 1;
    return `Humanoid ${Math.max(1, actorIndex)}`;
}

function getSelectedActorRoot() {
    if (!selectedJoint || selectedReferenceCube) return null;
    return getCharacterRootFromJoint(selectedJoint);
}

function syncActorDimensionControls() {
    if (!ui.actorSizePanel) return;

    const actor = getSelectedActorRoot();
    if (!actor) {
        ui.actorSizePanel.classList.add('hidden');
        return;
    }

    ui.actorSizePanel.classList.remove('hidden');
    ui.actorSizeName.textContent = getActorDisplayName(actor);
    ui.actorWidthInput.value = formatReferenceCubeDimension(actor.scale.x);
    ui.actorHeightInput.value = formatReferenceCubeDimension(actor.scale.y);
    ui.actorDepthInput.value = formatReferenceCubeDimension(actor.scale.z);
}

function readActorDimension(input, fallback) {
    return readReferenceCubeDimension(input, fallback);
}

function setActorDimensions(actor, width, height, depth) {
    const previousBounds = new THREE.Box3().setFromObject(actor);
    const previousMinY = Number.isFinite(previousBounds.min.y) ? previousBounds.min.y : null;
    const dimensions = {
        width: clampReferenceCubeSize(width),
        height: clampReferenceCubeSize(height),
        depth: clampReferenceCubeSize(depth)
    };

    actor.scale.set(dimensions.width, dimensions.height, dimensions.depth);
    actor.userData.dimensions = dimensions;
    actor.updateMatrixWorld(true);

    if (previousMinY !== null) {
        const nextBounds = new THREE.Box3().setFromObject(actor);
        if (Number.isFinite(nextBounds.min.y)) {
            actor.position.y += previousMinY - nextBounds.min.y;
            actor.updateMatrixWorld(true);
        }
    }
}

function handleActorDimensionInput() {
    const actor = getSelectedActorRoot();
    if (!actor) return;

    setActorDimensions(
        actor,
        readActorDimension(ui.actorWidthInput, actor.scale.x),
        readActorDimension(ui.actorHeightInput, actor.scale.y),
        readActorDimension(ui.actorDepthInput, actor.scale.z)
    );
    syncTransformAttachment();
    handlePoseEdited();
}

function setReferenceCubeDimensions(cube, width, height, depth) {
    const dimensions = {
        width: clampReferenceCubeSize(width),
        height: clampReferenceCubeSize(height),
        depth: clampReferenceCubeSize(depth)
    };

    cube.scale.set(dimensions.width, dimensions.height, dimensions.depth);
    cube.userData.dimensions = dimensions;
    cube.updateMatrixWorld(true);
}

function handleReferenceCubeDimensionInput() {
    if (!selectedReferenceCube) return;

    const current = selectedReferenceCube.userData.dimensions;
    setReferenceCubeDimensions(
        selectedReferenceCube,
        readReferenceCubeDimension(ui.cubeWidthInput, current.width),
        readReferenceCubeDimension(ui.cubeHeightInput, current.height),
        readReferenceCubeDimension(ui.cubeDepthInput, current.depth)
    );
}

function getReferenceCubePlacement(index) {
    return {
        x: 2.25 + (index % 3) * 1.5,
        z: -1.5 - Math.floor(index / 3) * 1.5
    };
}

function createReferenceCube(options = {}) {
    const cubeNumber = nextReferenceCubeId;
    nextReferenceCubeId += 1;

    const placement = getReferenceCubePlacement(referenceCubes.length);
    const width = Number.isFinite(options.width) ? options.width : 1;
    const height = Number.isFinite(options.height) ? options.height : 1;
    const depth = Number.isFinite(options.depth) ? options.depth : 1;
    const x = Number.isFinite(options.x) ? options.x : placement.x;
    const y = Number.isFinite(options.y) ? options.y : 0;
    const z = Number.isFinite(options.z) ? options.z : placement.z;

    const group = new THREE.Group();
    group.name = `Reference_Cube_${cubeNumber}`;
    group.position.set(x, y, z);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);

    const material = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x000000,
        roughness: 0.55,
        metalness: 0.02,
        transparent: true,
        opacity: 0.38,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.referenceCube = group;
    group.add(mesh);

    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
            color: 0xa5f3fc,
            transparent: true,
            opacity: 0.9
        })
    );
    group.add(edges);

    group.userData.mesh = mesh;
    group.userData.edges = edges;
    group.userData.dimensions = { width: 1, height: 1, depth: 1 };
    setReferenceCubeDimensions(group, width, height, depth);

    scene.add(group);
    referenceCubes.push(group);
    interactables.push(mesh);
    selectReferenceCube(group);
    setStatus(`${getReferenceCubeDisplayName(group)} added.`, 'info');
    return group;
}

function deleteReferenceCube(cube) {
    if (!cube) return;

    if (selectedReferenceCube === cube) {
        deselect();
    }

    removeInteractableObject(cube.userData.mesh);
    cube.traverse(obj => {
        disposeRenderable(obj);
    });
    scene.remove(cube);
    referenceCubes = referenceCubes.filter(item => item !== cube);
}

function deleteSelectedReferenceCube() {
    const cube = selectedReferenceCube;
    if (!cube) return;

    const cubeName = getReferenceCubeDisplayName(cube);
    deleteReferenceCube(cube);
    setStatus(`${cubeName} deleted.`, 'info');
}

function clearReferenceCubes() {
    const cubes = [...referenceCubes];
    cubes.forEach(deleteReferenceCube);
    referenceCubes = [];
}

function getWeaponPoseKey(weaponOrId) {
    const id = typeof weaponOrId === 'number'
        ? weaponOrId
        : Number.parseInt(weaponOrId?.userData?.weaponId, 10);
    return `weapon:${Number.isInteger(id) ? id : 0}`;
}

function getWeaponDisplayName(weapon) {
    return weapon?.name?.replace(/^Weapon_/, 'Weapon ').replace(/_/g, ' ') || 'Weapon';
}

function getWeaponPlacement(index) {
    return {
        x: -2.25 - (index % 3) * 1.1,
        y: 0.02,
        z: -1.5 - Math.floor(index / 3) * 1.3
    };
}

function clampWeaponSize(value) {
    return THREE.MathUtils.clamp(value, WEAPON_MIN_SIZE, WEAPON_MAX_SIZE);
}

function readWeaponDimension(input, fallback) {
    const value = Number.parseFloat(input.value);
    return Number.isFinite(value) ? clampWeaponSize(value) : fallback;
}

function syncWeaponDimensionsFromScale(weapon) {
    if (!weapon) return;

    weapon.userData.dimensions = {
        width: clampWeaponSize(Math.abs(weapon.scale.x) || WEAPON_DEFAULT_DIMENSIONS.width),
        length: clampWeaponSize(Math.abs(weapon.scale.y) || WEAPON_DEFAULT_DIMENSIONS.length),
        depth: clampWeaponSize(Math.abs(weapon.scale.z) || WEAPON_DEFAULT_DIMENSIONS.depth)
    };
}

function setWeaponDimensions(weapon, width, length, depth) {
    if (!weapon) return;

    const dimensions = {
        width: clampWeaponSize(width),
        length: clampWeaponSize(length),
        depth: clampWeaponSize(depth)
    };

    weapon.scale.set(dimensions.width, dimensions.length, dimensions.depth);
    weapon.userData.dimensions = dimensions;
    weapon.updateMatrixWorld(true);
}

function handleWeaponDimensionInput() {
    if (!selectedWeapon) return;

    const current = selectedWeapon.userData.dimensions;
    setWeaponDimensions(
        selectedWeapon,
        readWeaponDimension(ui.weaponWidthInput, current.width),
        readWeaponDimension(ui.weaponLengthInput, current.length),
        readWeaponDimension(ui.weaponDepthInput, current.depth)
    );
    handlePoseEdited();
}

function getAnchorableJoints() {
    const joints = [];

    characters.forEach(character => {
        character.traverse(obj => {
            if (obj.isGroup && obj.userData.isJoint) {
                joints.push(obj);
            }
        });
    });

    return joints;
}

function findJointByName(name) {
    let found = null;

    characters.some(character => {
        character.traverse(obj => {
            if (!found && obj.isGroup && obj.name === name) {
                found = obj;
            }
        });
        return Boolean(found);
    });

    return found;
}

function getJointDisplayName(joint) {
    const match = joint?.name?.match(/^(.*)_(\d+)$/);
    if (!match) return joint?.name || 'Joint';

    const baseName = match[1].replace(/_/g, ' ');
    const actorNumber = Number.parseInt(match[2], 10) + 1;
    return `H${actorNumber} ${baseName}`;
}

function syncWeaponAnchorOptions() {
    if (!ui.weaponAnchorSelect) return;

    const previousValue = ui.weaponAnchorSelect.value;
    const joints = getAnchorableJoints();
    const preferredJointName = selectedWeapon?.userData.anchor?.jointName
        || lastSelectedJoint?.name
        || previousValue;

    ui.weaponAnchorSelect.innerHTML = '';

    if (joints.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No limbs';
        ui.weaponAnchorSelect.appendChild(option);
        ui.weaponAnchorSelect.disabled = true;
        ui.anchorWeaponBtn.disabled = true;
        return;
    }

    joints.forEach(joint => {
        const option = document.createElement('option');
        option.value = joint.name;
        option.textContent = getJointDisplayName(joint);
        ui.weaponAnchorSelect.appendChild(option);
    });

    const nextValue = joints.some(joint => joint.name === preferredJointName)
        ? preferredJointName
        : joints[0].name;

    ui.weaponAnchorSelect.value = nextValue;
    ui.weaponAnchorSelect.disabled = false;
    ui.anchorWeaponBtn.disabled = !selectedWeapon;
}

function syncWeaponControls() {
    if (!ui.weaponPanel) return;

    if (!selectedWeapon) {
        ui.weaponPanel.classList.add('hidden');
        return;
    }

    const dimensions = selectedWeapon.userData.dimensions;
    const anchor = selectedWeapon.userData.anchor;

    ui.weaponPanel.classList.remove('hidden');
    ui.weaponWidthInput.value = formatReferenceCubeDimension(dimensions.width);
    ui.weaponLengthInput.value = formatReferenceCubeDimension(dimensions.length);
    ui.weaponDepthInput.value = formatReferenceCubeDimension(dimensions.depth);
    ui.weaponAnchorPoint.value = anchor?.point || 'end';
    syncWeaponAnchorOptions();

    if (anchor) {
        const joint = findJointByName(anchor.jointName);
        ui.weaponAnchorLabel.textContent = joint
            ? `Anchored: ${getJointDisplayName(joint)} ${anchor.point}`
            : 'Anchored: missing limb';
        ui.deanchorWeaponBtn.disabled = false;
    } else {
        ui.weaponAnchorLabel.textContent = 'Free';
        ui.deanchorWeaponBtn.disabled = true;
    }
}

function getJointAnchorLocalPosition(joint, point) {
    if (point !== 'end') {
        return new THREE.Vector3(0, 0, 0);
    }

    return joint?.userData?.anchorEndOffset?.clone?.() || new THREE.Vector3(0, 0, 0);
}

function getWeaponAnchorQuaternion(joint, point) {
    const quaternion = new THREE.Quaternion();
    if (point !== 'end') {
        return quaternion;
    }

    const endOffset = joint?.userData?.anchorEndOffset;
    if (!endOffset || endOffset.lengthSq() <= 1e-8) {
        return quaternion;
    }

    tempAnchorDirection.copy(endOffset).normalize();
    quaternion.setFromUnitVectors(tempAnchorBaseDirection, tempAnchorDirection);
    return quaternion;
}

function applyTransformPayloadToObject(object, transform) {
    if (!object || !transform) return;

    if (Array.isArray(transform.position)) {
        object.position.fromArray(transform.position);
    }

    if (Array.isArray(transform.quaternion)) {
        object.quaternion.fromArray(transform.quaternion);
        if (object.quaternion.lengthSq() === 0) {
            object.quaternion.identity();
        } else {
            object.quaternion.normalize();
        }
    }

    if (Array.isArray(transform.scale)) {
        object.scale.set(
            clampWeaponSize(Math.abs(transform.scale[0]) || WEAPON_DEFAULT_DIMENSIONS.width),
            clampWeaponSize(Math.abs(transform.scale[1]) || WEAPON_DEFAULT_DIMENSIONS.length),
            clampWeaponSize(Math.abs(transform.scale[2]) || WEAPON_DEFAULT_DIMENSIONS.depth)
        );
    }

    object.updateMatrixWorld(true);
}

function serializeObjectTransform(object) {
    return {
        position: [object.position.x, object.position.y, object.position.z],
        quaternion: [
            object.quaternion.x,
            object.quaternion.y,
            object.quaternion.z,
            object.quaternion.w
        ],
        scale: [object.scale.x, object.scale.y, object.scale.z]
    };
}

function serializeSceneWeapons() {
    return weapons.map(weapon => {
        syncWeaponDimensionsFromScale(weapon);
        return {
            id: weapon.userData.weaponId,
            name: weapon.name,
            color: weapon.userData.color || WEAPON_DEFAULT_COLOR,
            dimensions: { ...weapon.userData.dimensions },
            anchor: weapon.userData.anchor ? { ...weapon.userData.anchor } : null,
            transform: serializeObjectTransform(weapon)
        };
    });
}

function syncWeaponsToAsset(asset) {
    const weaponDefs = normalizeSerializedWeapons(asset?.scene?.weapons ?? asset?.weapons);

    clearWeapons();
    weaponDefs.forEach(definition => {
        createWeapon({
            ...definition,
            autoAnchor: false,
            select: false,
            silent: true
        });
    });
    syncWeaponControls();
}

function anchorWeaponToJoint(weapon, joint, point = 'end') {
    if (!weapon || !joint) return false;

    joint.add(weapon);
    weapon.position.copy(getJointAnchorLocalPosition(joint, point));
    weapon.quaternion.copy(getWeaponAnchorQuaternion(joint, point));
    weapon.userData.anchor = {
        jointName: joint.name,
        point
    };
    weapon.updateMatrixWorld(true);
    syncTransformAttachment();
    syncWeaponControls();
    return true;
}

function anchorSelectedWeaponFromControls() {
    if (!selectedWeapon) return;

    const joint = findJointByName(ui.weaponAnchorSelect.value);
    if (!joint) {
        setStatus('Select a limb anchor for the weapon.', 'error');
        syncWeaponControls();
        return;
    }

    const point = ui.weaponAnchorPoint.value === 'pivot' ? 'pivot' : 'end';
    anchorWeaponToJoint(selectedWeapon, joint, point);
    handlePoseEdited();
    setStatus(`${getWeaponDisplayName(selectedWeapon)} anchored to ${getJointDisplayName(joint)}.`, 'success');
}

function deanchorWeapon(weapon) {
    if (!weapon) return;

    weapon.updateMatrixWorld(true);
    scene.attach(weapon);
    weapon.userData.anchor = null;
    syncWeaponDimensionsFromScale(weapon);
    weapon.updateMatrixWorld(true);
    syncTransformAttachment();
    syncWeaponControls();
}

function deanchorSelectedWeapon() {
    if (!selectedWeapon) return;

    const weaponName = getWeaponDisplayName(selectedWeapon);
    deanchorWeapon(selectedWeapon);
    handlePoseEdited();
    setStatus(`${weaponName} deanchored.`, 'info');
}

function createWeapon(options = {}) {
    const explicitId = Number.parseInt(options.id, 10);
    const weaponId = Number.isInteger(explicitId) && explicitId > 0
        ? explicitId
        : nextWeaponId;
    nextWeaponId = Math.max(nextWeaponId, weaponId + 1);

    const dimensions = normalizeWeaponDimensions(options.dimensions ?? options);
    const placement = getWeaponPlacement(weapons.length);
    const group = new THREE.Group();
    group.name = String(options.name || `Weapon_${weaponId}`).trim() || `Weapon_${weaponId}`;
    group.position.set(
        Number.isFinite(options.x) ? options.x : placement.x,
        Number.isFinite(options.y) ? options.y : placement.y,
        Number.isFinite(options.z) ? options.z : placement.z
    );

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);

    const color = normalizeColorValue(options.color, WEAPON_DEFAULT_COLOR);
    const material = new THREE.MeshStandardMaterial({
        color,
        emissive: 0x000000,
        roughness: 0.32,
        metalness: 0.5
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.weapon = group;
    group.add(mesh);

    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
            color: 0xfef3c7,
            transparent: true,
            opacity: 0.75
        })
    );
    group.add(edges);

    group.userData.isWeapon = true;
    group.userData.weaponId = weaponId;
    group.userData.mesh = mesh;
    group.userData.edges = edges;
    group.userData.color = color;
    group.userData.anchor = null;
    setWeaponDimensions(group, dimensions.width, dimensions.length, dimensions.depth);

    scene.add(group);
    weapons.push(group);
    interactables.push(mesh);

    const requestedAnchor = normalizeWeaponAnchor(options.anchor);
    const autoAnchorJoint = options.autoAnchor === false ? null : selectedJoint;
    const anchorJoint = requestedAnchor
        ? findJointByName(requestedAnchor.jointName)
        : autoAnchorJoint;
    const anchorPoint = requestedAnchor?.point || 'end';

    if (anchorJoint) {
        anchorWeaponToJoint(group, anchorJoint, anchorPoint);
    }

    if (options.transform) {
        applyTransformPayloadToObject(group, options.transform);
        syncWeaponDimensionsFromScale(group);
    }

    if (options.select !== false) {
        selectWeapon(group);
    }

    if (!options.silent) {
        const suffix = anchorJoint ? ` anchored to ${getJointDisplayName(anchorJoint)}` : ' added';
        setStatus(`${getWeaponDisplayName(group)}${suffix}.`, 'info');
    }

    return group;
}

function selectWeapon(weapon) {
    if (selectedMesh) {
        setSelectedMeshEmissive(selectedMesh, 0x000000);
    }

    selectedMesh = weapon.userData.mesh;
    selectedJoint = null;
    selectedReferenceCube = null;
    selectedWeapon = weapon;
    resetPullDragState();
    setSelectedMeshEmissive(selectedMesh, 0x7c2d12);

    syncTransformAttachment();
    syncReferenceCubeControls();
    syncWeaponControls();
    syncActorDimensionControls();

    ui.selectionInfo.classList.remove('hidden');
    ui.selectedName.innerText = getWeaponDisplayName(weapon);
}

function deleteWeapon(weapon) {
    if (!weapon) return;

    if (selectedWeapon === weapon) {
        deselect();
    }

    removeInteractableObject(weapon.userData.mesh);
    weapon.traverse(obj => {
        disposeRenderable(obj);
    });
    weapon.parent?.remove(weapon);
    weapons = weapons.filter(item => item !== weapon);
    syncWeaponControls();
}

function deleteSelectedWeapon() {
    const weapon = selectedWeapon;
    if (!weapon) return;

    const weaponName = getWeaponDisplayName(weapon);
    deleteWeapon(weapon);
    setStatus(`${weaponName} deleted.`, 'info');
}

function clearWeapons() {
    const sceneWeapons = [...weapons];
    sceneWeapons.forEach(deleteWeapon);
    weapons = [];
}

function selectJoint(mesh) {
    if(selectedMesh) {
        setSelectedMeshEmissive(selectedMesh, 0x000000);
    }
    selectedMesh = mesh;
    selectedJoint = mesh.userData.joint;
    selectedReferenceCube = null;
    selectedWeapon = null;
    lastSelectedJoint = selectedJoint;
    syncReferenceCubeControls();
    syncWeaponControls();
    syncActorDimensionControls();
    // Highlight selected
    setSelectedMeshEmissive(selectedMesh, 0x333333);

    syncTransformAttachment();

    // Show info
    ui.selectionInfo.classList.remove('hidden');
    const cleanName = selectedJoint.name
        .replace(/_[0-9]+$/, '')
        .replace(/_/g, ' ');
    ui.selectedName.innerText = cleanName;
}

function deselect() {
    if(selectedMesh) {
        setSelectedMeshEmissive(selectedMesh, 0x000000);
        selectedMesh = null;
    }
    selectedJoint = null;
    selectedReferenceCube = null;
    selectedWeapon = null;
    resetPullDragState();
    transformControl.detach();
    ui.selectionInfo.classList.add('hidden');
    syncReferenceCubeControls();
    syncWeaponControls();
    syncActorDimensionControls();
}

function clearSceneCharacters() {
    clearWeapons();
    lastSelectedJoint = null;
    deselect();

    characters.forEach(character => {
        character.traverse(obj => {
            if (obj.isMesh) {
                removeInteractableObject(obj);
            }

            disposeRenderable(obj);
        });
        scene.remove(character);
    });

    characters = [];
}

function getCharacterPlacement(index) {
    if (index === 0) {
        return { x: 0, z: 0 };
    }

    if (index === 1) {
        return { x: -3, z: 0 };
    }

    if (index === 2) {
        return { x: 3, z: 0 };
    }

    const gridIndex = index - 3;
    return {
        x: (gridIndex % 3 - 1) * 3,
        z: -(Math.floor(gridIndex / 3) + 1) * 2
    };
}

function setCharacterColor(character, colorValue) {
    const color = new THREE.Color(colorValue);
    character.userData.characterColor = `#${color.getHexString()}`;

    character.traverse(obj => {
        if (!obj.isMesh) return;

        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach(material => {
            if (!material?.color || obj.userData.preserveColor) return;
            material.color.copy(color);
        });
    });
}

function createLimb(width, height, depth, pivotYOffset, material, name, charId) {
    const group = new THREE.Group();
    group.name = name + "_" + charId;
    const minY = -height * 0.5 + pivotYOffset;
    const maxY = height * 0.5 + pivotYOffset;
    const endY = Math.abs(maxY) >= Math.abs(minY) ? maxY : minY;
    group.userData.isJoint = true;
    group.userData.anchorEndOffset = new THREE.Vector3(0, endY, 0);
    
    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Translate geometry so the group origin acts as the joint pivot
    geometry.translate(0, pivotYOffset, 0); 
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Link mesh to its parent joint group for raycasting logic
    mesh.userData.joint = group;
    group.add(mesh);
    
    // Add to raycaster list
    interactables.push(mesh);
    
    return group;
}

function createCharacter(options = {}) {
    const charId = characters.length;
    const placement = getCharacterPlacement(charId);
    const x = Number.isFinite(options.x) ? options.x : placement.x;
    const z = Number.isFinite(options.z) ? options.z : placement.z;
    
    // Generate a pleasing random color for the character
    const color = options.color
        ? new THREE.Color(options.color)
        : new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
    const material = new THREE.MeshStandardMaterial({ 
        color: color,
        roughness: 0.4,
        metalness: 0.1
    });

    // Basic Humanoid Proportions & Rigging
    // ------------------------------------
    
    // 1. Root (Hips)
    const root = createLimb(1.0, 0.4, 0.6, 0, material, "Hips", charId);
    root.position.set(x, 2.6, z);
    
    // 2. Torso (Spine)
    const torso = createLimb(0.9, 1.2, 0.5, 0.6, material, "Spine", charId);
    torso.position.set(0, 0.2, 0); // Attached slightly above hip center
    root.add(torso);
    
    // 3. Head
    const head = createLimb(0.7, 0.8, 0.7, 0.4, material, "Head", charId);
    head.position.set(0, 1.2, 0); // Attached to top of torso
    torso.add(head);

    // 4. Arms
    const armW = 0.25;
    
    // Left Arm
    const lUpperArm = createLimb(armW, 0.9, armW, -0.45, material, "Left_Upper_Arm", charId);
    lUpperArm.position.set(0.6, 1.1, 0); // Right side of torso (viewer left)
    torso.add(lUpperArm);
    
    const lLowerArm = createLimb(armW*0.9, 0.9, armW*0.9, -0.45, material, "Left_Lower_Arm", charId);
    lLowerArm.position.set(0, -0.9, 0); // End of upper arm
    lUpperArm.add(lLowerArm);

    // Right Arm
    const rUpperArm = createLimb(armW, 0.9, armW, -0.45, material, "Right_Upper_Arm", charId);
    rUpperArm.position.set(-0.6, 1.1, 0); // Left side of torso
    torso.add(rUpperArm);
    
    const rLowerArm = createLimb(armW*0.9, 0.9, armW*0.9, -0.45, material, "Right_Lower_Arm", charId);
    rLowerArm.position.set(0, -0.9, 0);
    rUpperArm.add(rLowerArm);

    // 5. Legs
    const legW = 0.35;

    // Left Leg
    const lUpperLeg = createLimb(legW, 1.1, legW, -0.55, material, "Left_Upper_Leg", charId);
    lUpperLeg.position.set(0.25, -0.2, 0); // Bottom of hips
    root.add(lUpperLeg);
    
    const lLowerLeg = createLimb(legW*0.9, 1.1, legW*0.9, -0.55, material, "Left_Lower_Leg", charId);
    lLowerLeg.position.set(0, -1.1, 0);
    lUpperLeg.add(lLowerLeg);

    // Right Leg
    const rUpperLeg = createLimb(legW, 1.1, legW, -0.55, material, "Right_Upper_Leg", charId);
    rUpperLeg.position.set(-0.25, -0.2, 0);
    root.add(rUpperLeg);
    
    const rLowerLeg = createLimb(legW*0.9, 1.1, legW*0.9, -0.55, material, "Right_Lower_Leg", charId);
    rLowerLeg.position.set(0, -1.1, 0);
    rUpperLeg.add(rLowerLeg);

    // Default minor pose variation so it doesn't look completely rigid
    lUpperArm.rotation.z = 0.2;
    rUpperArm.rotation.z = -0.2;
    lUpperLeg.rotation.x = 0.05;
    rUpperLeg.rotation.x = -0.05;

    root.userData.characterColor = `#${color.getHexString()}`;
    scene.add(root);
    characters.push(root);
    syncWeaponControls();
    return root;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
    resizeMotionCaptureOverlay();
    refreshTimelineUi();
}

// Purpose: timeline rendering, animation ticking, and render loop runtime.

function setCurrentTime(time, options = {}) {
    currentTime = clampTime(time);
    ensureTimelineCovers(currentTime);

    if (options.applyPose !== false) {
        applyPoseAtTime(currentTime);
    } else {
        applyAnimationEffectsState(currentTime);
    }

    if (options.syncVideo !== false) {
        syncMotionCapturePreviewToTimeline(options.forceVideoSeek === true);
    }
    syncMotionCaptureTransportUi();
    refreshTimelineUi();
}

function refreshTimelineUi() {
    clampClipRangeToAnimation();
    const selectedKeyframe = findKeyframeById(selectedKeyframeId);
    ui.keyframeCount.innerText = String(keyframes.length);
    ui.selectedFrame.innerText = selectedKeyframe ? `K${selectedKeyframe.id} @ ${formatTime(selectedKeyframe.time)}` : 'None';
    ui.animationLength.innerText = formatTime(getAnimationEndTime());
    ui.timeInput.value = currentTime.toFixed(1);
    ui.speedSlider.value = String(playbackSpeed);
    ui.speedValue.innerText = `${playbackSpeed.toFixed(2)}x`;
    ui.clipAnimationBtn.disabled = keyframes.length === 0;
    ui.clipAnimationBtn.className = keyframes.length === 0
        ? CLIP_DISABLED_BUTTON_CLASS
        : CLIP_BUTTON_CLASS;

    renderTimeline();
    updatePlayButton();
}

function renderTimeline() {
    const duration = getTimelineDuration();
    const trackWidth = ui.timelineTrack.clientWidth || 0;
    const startOffset = 12;
    const usableWidth = Math.max(0, trackWidth - startOffset * 2);
    const playheadRatio = duration <= 0 ? 0 : currentTime / duration;
    const playheadX = startOffset + usableWidth * THREE.MathUtils.clamp(playheadRatio, 0, 1);
    const clipStartRatio = duration <= 0 ? 0 : clipRange.start / duration;
    const clipEndRatio = duration <= 0 ? 0 : clipRange.end / duration;
    const clipStartX = startOffset + usableWidth * THREE.MathUtils.clamp(clipStartRatio, 0, 1);
    const clipEndX = startOffset + usableWidth * THREE.MathUtils.clamp(clipEndRatio, 0, 1);
    const clipWidth = Math.max(0, clipEndX - clipStartX);

    ui.timelineFill.style.width = `${Math.max(0, playheadX - startOffset)}px`;
    ui.timelinePlayhead.style.left = `${playheadX}px`;
    ui.timelineClipBefore.style.left = `${startOffset}px`;
    ui.timelineClipBefore.style.width = `${Math.max(0, clipStartX - startOffset)}px`;
    ui.timelineClipRange.style.left = `${clipStartX}px`;
    ui.timelineClipRange.style.width = `${clipWidth}px`;
    ui.timelineClipAfter.style.left = `${clipEndX}px`;
    ui.timelineClipAfter.style.width = `${Math.max(0, startOffset + usableWidth - clipEndX)}px`;
    ui.timelineClipStart.style.left = `${clipStartX}px`;
    ui.timelineClipEnd.style.left = `${clipEndX}px`;
    const showClipHandles = keyframes.length > 0;
    ui.timelineClipBefore.style.display = showClipHandles ? 'block' : 'none';
    ui.timelineClipRange.style.display = showClipHandles ? 'block' : 'none';
    ui.timelineClipAfter.style.display = showClipHandles ? 'block' : 'none';
    ui.timelineClipStart.style.display = showClipHandles ? 'block' : 'none';
    ui.timelineClipEnd.style.display = showClipHandles ? 'block' : 'none';
    ui.timelineKeyframes.innerHTML = '';
    ui.timelineEndLabel.innerText = formatTime(duration);

    keyframes.forEach(keyframe => {
        const marker = document.createElement('button');
        const x = startOffset + usableWidth * (duration <= 0 ? 0 : keyframe.time / duration);
        marker.type = 'button';
        marker.className = `timeline-marker${keyframe.id === selectedKeyframeId ? ' selected' : ''}`;
        marker.style.left = `${x}px`;
        marker.style.pointerEvents = 'auto';
        marker.title = `Keyframe ${keyframe.id} at ${formatTime(keyframe.time)}`;
        marker.setAttribute('aria-label', marker.title);
        marker.addEventListener('pointerdown', (event) => handleMarkerPointerDown(event, keyframe.id));
        ui.timelineKeyframes.appendChild(marker);
    });
}

function updatePlayButton() {
    ui.playBtn.innerHTML = isPlaying ? STOP_ICON : PLAY_ICON;
    ui.playBtn.className = isPlaying
        ? STOP_BUTTON_CLASS
        : PLAY_BUTTON_CLASS;
}

function formatTime(value) {
    return `${(value || 0).toFixed(1)}s`;
}

function roundTime(value) {
    return Math.round((value + Number.EPSILON) / KEYFRAME_TIME_STEP) * KEYFRAME_TIME_STEP;
}

function roundUpTime(value) {
    return Math.ceil((value - Number.EPSILON) / KEYFRAME_TIME_STEP) * KEYFRAME_TIME_STEP;
}

function updateAnimation(delta) {
    if (!isPlaying) return;
    if (keyframes.length < 2) {
        stopPlayback();
        return;
    }

    const endTime = getAnimationEndTime();
    if (endTime <= 0) {
        stopPlayback();
        applyPoseAtTime(0);
        refreshTimelineUi();
        return;
    }

    currentTime += delta * playbackSpeed;
    while (currentTime > endTime) {
        currentTime -= endTime;
    }

    applyPoseAtTime(currentTime);
    refreshTimelineUi();
}

function animate() {
    requestAnimationFrame( animate );
    
    const delta = clock.getDelta();
    updateAnimation(delta);
    updateAnimationEffects(delta);
    
    orbitControls.update();
    renderer.render( scene, camera );
}

// Purpose: explicit standalone startup entrypoint.

init();
animate();
})();
