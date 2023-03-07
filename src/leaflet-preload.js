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

		getNumTilesForPreload: function (bounds, map, minZoom, maxZoom) {
			var numTiles = 0;
			for (let z = minZoom; z <= maxZoom; z++) {
				let tBounds = this.getTileBounds(bounds, map, z);
				numTiles += (tBounds.max.x - tBounds.min.x + 1) * (tBounds.max.y - tBounds.min.y + 1);
			}
			return numTiles;
		},

		preload: function (bounds, map, minZoom, maxZoom) {
			var urls = [];
			for (let z = minZoom; z <= maxZoom; z++) {
				let _urls = this.getTileUrls(bounds, map, z);
				// eslint-disable-next-line no-console
				console.log("Zoom ", z, " urls ", _urls.length);
				urls.push(..._urls);
			}
			return map.preloadImages(urls);
		}
	});


	L.Map.include({

		_preloadImg: function (img, url) {
			return new Promise((resolve, reject) => {
				img.src = url;
				img.onload = () => { this.fire('preload:tilesuccess'); resolve(img); };
				img.onerror = () => { this.fire('preload:tilefailed'); reject(img); };
			});
		},

		_finishPreload: function (results) {
			// eslint-disable-next-line no-console
			console.log("Done preloading");
			let badUrls = [];
			results.forEach(res => {
				if (res.status == 'rejected') {
					badUrls.push(res.reason.src);
				}
			});
			this.fire('preload:finished',
				{
					total: results.length,
					rejected: badUrls
				}
			);
		},

		preloadImages: function (urls) {
			/* Should probably be a util function in L.Utils */
			let promises = [];
			urls.forEach(
				url => {
					var img = new Image();
					promises.push(this._preloadImg(img, url));
				}
			);
			return promises;
		},

		getNumTilesForPreload: function (minZoom, maxZoom, bounds = null, layers = null) {
			let numTiles = 0;
			if (bounds == null) {
				bounds = this.getBounds();
			}
			if (!layers) {
				layers = [];
				this.eachLayer(lyr => layers.push(lyr));
			}
			layers.forEach(lyr => {
				if (lyr.canPreload) {
					numTiles += lyr.getNumTilesForPreload(bounds, this, minZoom, maxZoom);
				}
			});
			return numTiles;
		},

		preloadLayers: function (minZoom, maxZoom, bounds = null, layers = null) {
			if (bounds == null) {
				bounds = this.getBounds();
			}
			// let zoom = this.getZoom();
			let promises = [];
			if (!layers) {
				layers = [];
				this.eachLayer(lyr => layers.push(lyr));
			}
			layers.forEach(lyr => {
				if (lyr.canPreload) {
					promises.push(...lyr.preload(bounds, this, minZoom, maxZoom));
				}
			});
			Promise.allSettled(promises).then(values => this._finishPreload(values));
		}
	});



}(jQuery, L/*,this, document*/));



