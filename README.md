# leaflet-preload
>


## Description
This package is used for preloading images for TileLayers in Leaflet to improve user experience e.g. on slow connections

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
    map.preloadLayers(statusWrapper.controlObjects);
    /* if needed, cancel active preload(s) */
    map.cancelPreload(statusWrapper.controlObjects);
}

```
### Events
* preload:tilesuccess - fired when an image (a tile) is successfully loaded.
* preload:tilefailed  - fired when an image (a tile) is failed to load.
* preload:finished - fired when map.preloadLayers is done (finished or cancelled).

### Options
None atm

## Copyright and License
This plugin is licensed under the [MIT license](https://github.com/FCOO/leaflet-preload/LICENSE).

Copyright (c) 2023 [FCOO](https://github.com/FCOO)

## Contact information

Simon Lyngby Kokkendorff slk@fcoo.dk


## Credits and acknowledgements
