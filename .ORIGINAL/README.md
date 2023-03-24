# leaflet-preload
>


## Description
This package is used for preloading images for TileLayers in Leaflet to improve user experience e.g. on slow connections.
The plugin uses the internals of L.TileLayer and L.TileLayer.WMS to generate image urls that can be preloaded and cached by the browser.
The rest of the internal layer logic, e.g. handling DOM elements, redrawing etc, is not relevant.

## Installation
### bower
`bower install https://github.com/FCOO/leaflet-preload.git --save`

## Demo
http://FCOO.github.io/leaflet-preload/demo/ 

## Usage
### Can be used on a TileLayer:
```javascript
var layer = L.tileLayer.wms(url, options);
var status = layer.preparePreload(map.getBounds(), map, 4, 8);
if (status.numTiles < 10000) {
    status.preload().then(console.log);
    /* if needed, cancel active preload */
    status.cancel();
}
```
### On Map:
```javascript
// Preload all TileLayers on map (or provide an array of layers)
map.on('preload:tilesuccess', someFunction);
map.on('preload:tilefailed', anotherFunction);
map.on('preload:finished', thirdFunction);
var statusWrapper = map.preparePreload(4, 8);
if (statusWrapper.numTiles < 10000) {
    statusWrapper.preload().then(console.log);
    /* if needed, cancel active preload(s) */
    statusWrapper.cancel();
}
```


### Preload a custom subclass of e.g. L.TileLayer.WMS
Make sure that the layer is not on map - for example by cloning a map layer first.
```javascript
// Set custom wmsParam, e.g. time without redraw
layer.setParams({time: nextTime}, true);
let status = layer.preparePreload(map.getBounds(), map, map.getZoom() - 1, map.getZoom() + 1);
status.preload();
```

### Events
* preload:tilesuccess - fired when an image (a tile) is successfully loaded.
* preload:tilefailed  - fired when an image (a tile) failed to load.
* preload:finished - fired when preload wrapper function (via map) is done (finished or cancelled).

### Options
None atm

## Copyright and License
This plugin is licensed under the [MIT license](https://github.com/FCOO/leaflet-preload/LICENSE).

Copyright (c) 2023 [FCOO](https://github.com/FCOO)

## Contact information

Simon Lyngby Kokkendorff slk@fcoo.dk


## Credits and acknowledgements
