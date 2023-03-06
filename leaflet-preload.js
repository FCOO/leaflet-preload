/* Add preload methods to existing Leaflet classes */
L.TileLayer.include({
    canPreload: true,

    getTileUrls: function (bounds, map, zoom) {
        var ts = this.getTileSize().x;
        var min = map.project(bounds.getNorthWest(), zoom).divideBy(ts).floor(),
            max = map.project(bounds.getSouthEast(), zoom).divideBy(ts).floor(),
            urls = [];

        for (let i = min.x; i <= max.x; i++) {
            for (let j = min.y; j <= max.y; j++) {
                let coords = new L.Point(i, j);
                coords.z = zoom;
                urls.push(this.getTileUrl(coords));
            }
        }

        return urls;
    },

    getNumTilesForPreload: function (bounds, map, minZoom, maxZoom) {
        let numTiles = 0;
        for (let z = minZoom; z <= maxZoom; z++) {
            numTiles += this.getTileUrls(bounds, map, z).length;
        }
        return numTiles;
    },

    preload: function (bounds, map, minZoom, maxZoom) {
        var urls = [];
        for (let z = minZoom; z <= maxZoom; z++) {
            let _urls = this.getTileUrls(bounds, map, z);
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
            img.onload = () => { this.fire('preload:tilesuccess'); resolve(img) };
            img.onerror = () => { this.fire('preload:tilefailed'); reject(img); }
        });
    },

    _finishPreload: function (results) {
        console.log("Done preloading");
        let badUrls = [];
        results.forEach(res => {
            if (res.status == 'rejected') {
                console.log("BAD: " + res.reason.src);
                badUrls.push(res.reason.src);
            }
        })
        this.fire('preload:finished',
            {
                total: results.length,
                rejected: badUrls
            }
        )
    },

    preloadImages: function (urls) {
        /* Should probably be a util function in L.Utils */
        let promises = [];
        urls.forEach(
            url => {
                var img = new Image();
                promises.push(this._preloadImg(img, url));
            }
        )
        return promises;
    },

    getNumTilesForPreload: function (minZoom, maxZoom, bounds = null) {
        let numTiles = 0;
        if (bounds == null) {
            bounds = this.getBounds();
        }
        this.eachLayer(lyr => {
            if (lyr.canPreload) {
                numTiles += lyr.getNumTilesForPreload(bounds, this, minZoom, maxZoom)

            }
        });
        return numTiles;
    },

    preloadLayers: function (minZoom, maxZoom, bounds = null) {
        if (bounds == null) {
            bounds = this.getBounds();
        }
        // let zoom = this.getZoom();
        let promises = [];
        this.eachLayer(lyr => {
            if (lyr.canPreload) {
                promises.push(...lyr.preload(bounds, this, minZoom, maxZoom));
            }
        });
        Promise.allSettled(promises).then(values => this._finishPreload(values));
    }
});
