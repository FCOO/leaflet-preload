/****************************************************************************
	leaflet-preload.js,

	(c) 2023, FCOO

	https://github.com/FCOO/leaflet-preload
	https://github.com/FCOO

****************************************************************************/
(function ($, L/*,window, document, undefined*/) {
	"use strict";

	/* Add preload methods to existing Leaflet classes */
	L.TileLayer.include({

		_preloadImg: function (map, img, url) {
			return new Promise((resolve, reject) => {
				img.src = url;
				img.onload = () => { map.fire('preload:tilesuccess'); resolve(img); };
				img.onerror = () => { map.fire('preload:tilefailed'); reject(img); };
			});
		},

		preloadImages: function (map, urls) {
			/* Should probably be a util function in L.Utils */
			let promises = [];
			urls.forEach(
				url => {
					var img = new Image();
					promises.push(this._preloadImg(map, img, url));
				}
			);
			return promises;
		},

		_intersectLatLngBounds: function (bounds1, bounds2) {
			/* intersect with other LatLngBounds */
			if (!bounds1.intersects(bounds2)) {
				return null;
			}
			var west = Math.max(bounds1.getWest(), bounds2.getWest());
			var east = Math.min(bounds1.getEast(), bounds2.getEast());
			var north = Math.min(bounds1.getNorth(), bounds2.getNorth());
			var south = Math.max(bounds1.getSouth(), bounds2.getSouth());
			return new L.LatLngBounds([south, west], [north, east]);
		},

		_getTileUrls: function (bounds, map, zoom) {
			var urls = [],
                tBounds = this.getTileBounds(bounds, map, zoom);

			// Emulate that we are on map
			this._tileZoom = zoom;
console.log('>>>>>>>>>>>>', this._map, map);
this._map = this._map || map;

			this._resetGrid();

			if (!tBounds) {
				return urls;
			}
			for (let i = tBounds.min.x; i <= tBounds.max.x; i++) {
				for (let j = tBounds.min.y; j <= tBounds.max.y; j++) {
					let coords = new L.Point(i, j);
					coords.z = zoom;
					urls.push(this.getTileUrl(coords));
				}
			}
			return urls;
		},

		getTileBounds: function (bounds, map, zoom) {
			var ts = this.getTileSize().x;
			// Check if bounds are set on layer:
			if (this.options.bounds) {
				if (!this.options.bounds.intersects(bounds)) {
					return null;
				}
				bounds = this._intersectLatLngBounds(bounds, this.options.bounds);
			}
			return {
				min: map.project(bounds.getNorthWest(), zoom).divideBy(ts).floor(),
				max: map.project(bounds.getSouthEast(), zoom).divideBy(ts).floor()
			};
		},

		getNumTilesForPreload: function (bounds, map, zoomList) {
			var _this = this,
                numTiles = 0;
            zoomList.forEach((z) => {
				let tBounds = _this.getTileBounds(bounds, map, z);
				if (tBounds) {
					numTiles += (tBounds.max.x - tBounds.min.x + 1) * (tBounds.max.y - tBounds.min.y + 1);
				}
			});
			return numTiles;
		},

		preparePreload: function (bounds, map, minZoom, maxZoom, newWMSParams = null) {
            var zoomList = [];
            for (let z = minZoom; z <= maxZoom; z++)
                zoomList.push(z);
            return this.preparePreloadZoomList(bounds, map, zoomList, newWMSParams);
        },

		preparePreloadZoomList: function (bounds, map, zoomList, newWMSParams = null) {
			/* Return controlObject for preload method */
			var lyr = this;
			/*
			See if layer is on map and create shadow layer if needed.
			-
			If you have a custom subclass which e.g. overrides getTileUrl, create a clone yourself
			Which is NOT on map before calling this.
			If subclass does not override getTileUrl, this shouldn't be needed.
			*/
			if (this instanceof L.TileLayer.WMS) {
				if (this._map) {
					// Layer is on map - construct a shadow
					// Perhaps not really needed for WMS class
					lyr = L.tileLayer.wms(this._url, this.options);
				}

				lyr._map = map;
				lyr._crs = this.options.crs || map.options.crs;
				lyr._wmsVersion = parseFloat(this.wmsParams.version);
				const projectionKey = this._wmsVersion >= 1.3 ? 'crs' : 'srs';
				lyr.wmsParams[projectionKey] = this._crs.code;
				if (newWMSParams) {
					lyr.setParams(newWMSParams, true);
				}
			} else if (this._map) {
				// Layer is on map - create shadow
				lyr = L.tileLayer(this._url, this.options);
				lyr._map = map;
			}
			return {
				cancelled: false,
				status: null,
				// Layer that isn't on map
				layer: lyr,
				map: map,
				bounds: bounds,
                zoomList: zoomList,
				numTiles: this.getNumTilesForPreload(bounds, map, zoomList/*minZoom, maxZoom*/),
				success: 0,
				failed: 0,
				cancel: function () {
					this.cancelled = true;
					this.status = 'cancelled';
				},

				preload: function (chunkSize = 32, sleep = 0) {
					return this.layer._preload(this, chunkSize, sleep);
				}
			};
		},


		_preload: async function (controlObject, chunkSize = 32, sleep = 0) {
			/* Preload with parameters specified in controlObject
			* chunkSize: How many images to start loading simultaneously
			* sleep: Sleep this many millis between starting new downloads
			*/
			var _this = this, urls = [];
			controlObject.status = 'running';
            controlObject.zoomList.forEach((z) => {
                let _urls = this._getTileUrls(controlObject.bounds, controlObject.map, z);

    			urls.push(..._urls);

	    		// eslint-disable-next-line no-console
		    	console.log("Zoom ", z, " urls ", _urls.length);
            });

			var start = 0, stop = chunkSize, nSuccess = 0, nFailed = 0;

			while (start < urls.length && (!controlObject.cancelled)) {
				let badUrls = [];
				if (sleep) {
					await new Promise(r => setTimeout(r, sleep));
				}
				let promises = [];
				for (let url of urls.slice(start, stop)) {
					if (!controlObject.cancelled) {
						var img = new Image();
						promises.push(this._preloadImg(controlObject.map, img, url));
					}
				}
				if (controlObject.cancelled) {
					break;
				}
				// TODO: Special handling if cancelled?
				let results = await Promise.allSettled(promises);
				results.forEach(res => {
					if (res.status == 'rejected') {
						nFailed += 1;
						badUrls.push(res.reason.src);
					} else {
						nSuccess += 1;
					}
				});
				start += chunkSize;
				stop += chunkSize;
			}
			if (controlObject.cancelled) {
				// eslint-disable-next-line no-console
				console.log("Preload cancelled at ", start, stop);
			}
			// TODO: Perhaps retry bad urls?
			if (!controlObject.cancelled) { controlObject.status = 'finished'; }
			controlObject.success = nSuccess;
			controlObject.failed = nFailed;
			return controlObject;
		},

	});

    /***************************************************
    L.Map
    ***************************************************/
	L.Map.include({
		preparePreload: function (minZoom, maxZoom, bounds = null, layers = null) {
            var zoomList = [];
            for (let z = minZoom; z <= maxZoom; z++)
                zoomList.push(z);
            return this.preparePreloadZoomList(zoomList, bounds, layers);
        },

		preparePreloadZoomList: function(zoomList, bounds = null, layers = null) {
			/* Wrapper of L.TileLayer.preparePreload */
			var numTiles = 0, controlObjects = [];
			if (bounds == null) {
				bounds = this.getBounds();
			}
			if (!layers) {
				layers = [];
				this.eachLayer(lyr => layers.push(lyr));
			}
			for (let lyr of layers) {
				if (lyr instanceof L.TileLayer) {
					let cObj = lyr.preparePreloadZoomList(bounds, this, zoomList);
					controlObjects.push(cObj);
					numTiles += cObj.numTiles;
				}
			}
			return {
				numTiles: numTiles,
				map: this,
				controlObjects: controlObjects,
				preload: function (chunkSize = 32, sleep = 0) {
					return this.map.preloadLayers(this.controlObjects, chunkSize, sleep);
				},
				cancel: function () {
					for (let cObj of this.controlObjects) {
						cObj.cancel();
					}
				}
			};
		},

		preloadLayers: async function (controlObjects, chunkSize = 32, sleep = 0) {
			/* Wrapper of L.TileLayer.preload */
			var success = 0, failed = 0;
			for (let cObj of controlObjects) {
				let res = await cObj.preload(chunkSize, sleep);
				success += res.success;
				failed += res.failed;
			}
			this.fire('preload:finished', { success: success, failed: failed });
		},


        /*****************************************
        Automatic preload
        *****************************************/
        _on_moveend_preload: function(e){
            if (!this.options.preload) return;

            //Craete primary preload for zoom in and zoom out
            var mapMinZoom = this.getMinZoom(),
                mapZoom    = this.getZoom(),
                mapMaxZoom = this.getMaxZoom(),

                primaryMaxZoom = Math.min( mapMaxZoom, mapZoom + this.options.preloadOptions.primaryZoomIn  ),
                maxZoom        = Math.min( mapMaxZoom, mapZoom + this.options.preloadOptions.zoomIn         ),
                primaryMinZoom = Math.max( mapMinZoom, mapZoom - this.options.preloadOptions.primaryZoomOut ),
                minZoom        = Math.max( mapMinZoom, mapZoom - this.options.preloadOptions.zoomOut        ),

                zoomList = [],
                z;

            //Add prioritized zoom-levels
            //1. Primary zoom in
            for (z = mapZoom+1; z <= primaryMaxZoom; z++)
                zoomList.push(z);

            //2. Primary zoom out
            for (z = mapZoom-1; z >= primaryMinZoom; z--)
                zoomList.push(z);

            //3. Rest of zoom in
            for (z = primaryMaxZoom+1; z <= maxZoom; z++)
                zoomList.push(z);

            //4. Rest of zoom out
            for (z = primaryMinZoom-1; z >= minZoom; z--)
                zoomList.push(z);

//console.log('Preload', this.getZoom(), this.getMinZoom(), this.getMaxZoom(), 'primaryMinZoom', primaryMinZoom, 'primaryMaxZoom', primaryMaxZoom, 'minZoom', minZoom, 'maxZoom', maxZoom  );
//console.log('zoomList', zoomList);

            if (this.preloadStatus)
                this.preloadStatus.cancel();

            this.preloadStatus = this.preparePreloadZoomList(zoomList);
//console.log(zoomList);
            this.preloadStatus.preload();

        }
	});


    L.Map.mergeOptions({
        preload       : false,
        preloadOptions: {
            zoomOut       : 1,
            zoomIn        : 3,

            primaryZoomOut: 0,
            primaryZoomIn : 1
        }
    });

    L.Map.addInitHook(function () {
        if (this.options.preload){
            this.on('moveend zoomlevelschange', this._on_moveend_preload);
        }
    });

}(jQuery, L/*,this, document*/));



