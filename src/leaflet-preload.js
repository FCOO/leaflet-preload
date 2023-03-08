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
		canPreload: true,

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

		getTileUrls: function (bounds, map, zoom) {
			var urls = [];
			var tBounds = this.getTileBounds(bounds, map, zoom);
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
			return {
				min: map.project(bounds.getNorthWest(), zoom).divideBy(ts).floor(),
				max: map.project(bounds.getSouthEast(), zoom).divideBy(ts).floor()
			};
		},

		preparePreload: function (bounds, map, minZoom, maxZoom) {
			return {
				cancelled: false,
				status: null,
				layer: this,
				map: map,
				bounds: bounds,
				minZoom: minZoom,
				maxZoom: maxZoom,
				numTiles: this.getNumTilesForPreload(bounds, map, minZoom, maxZoom),
				success: 0,
				failed: 0,
				cancel: function () {
					this.cancelled = true;
					this.status = 'cancelled';
				},

				preload: function (chunkSize = 32, sleep = 0) {
					return this.layer.preload(this, chunkSize, sleep);
				}
			};
		},


		preload: async function (controlObject, chunkSize = 32, sleep = 0) {
			var urls = [];
			controlObject.status = 'running';
			for (let z = controlObject.minZoom; z <= controlObject.maxZoom; z++) {
				let _urls = this.getTileUrls(controlObject.bounds, controlObject.map, z);
				urls.push(..._urls);
				// eslint-disable-next-line no-console
				console.log("Zoom ", z, " urls ", _urls.length);
			}
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

		getNumTilesForPreload: function (bounds, map, minZoom, maxZoom) {
			var numTiles = 0;
			for (let z = minZoom; z <= maxZoom; z++) {
				let tBounds = this.getTileBounds(bounds, map, z);
				numTiles += (tBounds.max.x - tBounds.min.x + 1) * (tBounds.max.y - tBounds.min.y + 1);
			}
			return numTiles;
		}

	});


	L.Map.include({

		cancelPreload: function (controlObjects) {
			for (let cObj of controlObjects) {
				cObj.cancel();
			}
		},

		preparePreload: function (minZoom, maxZoom, bounds = null, layers = null) {
			var numTiles = 0, controlObjects = [];
			if (bounds == null) {
				bounds = this.getBounds();
			}
			if (!layers) {
				layers = [];
				this.eachLayer(lyr => layers.push(lyr));
			}
			for (let lyr of layers) {
				if (lyr.canPreload) {
					let cObj = lyr.preparePreload(bounds, this, minZoom, maxZoom);
					controlObjects.push(cObj);
					numTiles += cObj.numTiles;
				}
			}
			return { numTiles: numTiles, controlObjects: controlObjects };
		},

		preloadLayers: async function (controlObjects, chunkSize = 32, sleep = 0) {
			var success = 0, failed = 0;
			for (let cObj of controlObjects) {
				let res = await cObj.preload(chunkSize, sleep);
				success += res.success;
				failed += res.failed;
			}
			this.fire('preload:finished', { success: success, failed: failed });
		}
	});



}(jQuery, L/*,this, document*/));



