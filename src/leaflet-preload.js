/****************************************************************************
    leaflet-preload.js,

    (c) 2023, FCOO

    https://github.com/FCOO/leaflet-preload
    https://github.com/FCOO



****************************************************************************/
(function ($, L/*,window, document, undefined*/) {
    "use strict";

    L.preloadDEBUG = L.preloadDEBUG || false;

    function _debug(){
        if (L.preloadDEBUG)
            // eslint-disable-next-line no-console
            console.log.apply(null, arguments);
    }

    /* Add preload methods to existing Leaflet classes */

    /********************************************************
    L.TileLayer
    ********************************************************/
    L.TileLayer.include({

        _preloadImg: function (map, img, url) {
            return new Promise((resolve, reject) => {
                img.src = url;
                img.onload  = () => { map.fire('preload:tilesuccess'); resolve(img); };
                img.onerror = () => { map.fire('preload:tilefailed');  reject(img);  };
            });
        },

        preloadImages: function (map, urls) {
            /* Should probably be a util function in L.Utils */
            let promises = [];
            urls.forEach( url => {
                var img = new Image();
                promises.push(this._preloadImg(map, img, url));
            });
            return promises;
        },

        _intersectLatLngBounds: function (bounds1, bounds2) {
            /* intersect with other LatLngBounds */
            if (!bounds1.intersects(bounds2)) {
                return null;
            }
            var west  = Math.max(bounds1.getWest(),  bounds2.getWest());
            var east  = Math.min(bounds1.getEast(),  bounds2.getEast());
            var north = Math.min(bounds1.getNorth(), bounds2.getNorth());
            var south = Math.max(bounds1.getSouth(), bounds2.getSouth());
            return new L.LatLngBounds([south, west], [north, east]);
        },

        getTileBounds: function (map, bounds, zoom, reducedBounds) {

            var ts = this.getTileSize().x;
            // Check if bounds are set on layer:
            if (this.options.bounds) {
                if (!this.options.bounds.intersects(bounds))
                    return null;
                bounds = this._intersectLatLngBounds(bounds, this.options.bounds);
            }

            var result = {
                min: map.project(bounds.getNorthWest(), zoom).divideBy(ts).floor(),
                max: map.project(bounds.getSouthEast(), zoom).divideBy(ts).floor()
            };

            if (reducedBounds)
                ['y','x'].forEach( id => {
                    var min   = result.min[id],
                        range = result.max[id] - min;
                    result.min[id] = Math.floor( min + range * 1/4 );
                    result.max[id] = Math.ceil ( min + range * 3/4 );
                });

            return result;
        },


        _getTileUrls: function (map, bounds, zt) {
            var urls = [],
                zoom = zt.zoom,
                tBounds = this.getTileBounds(map, bounds, zoom, zt.reducedBounds),
                shadowSelf = this._preload_shadowSelf(map);

            // Emulate that we are on map
            shadowSelf._tileZoom = zoom;
            shadowSelf._resetGrid();

            if (!tBounds)
                return urls;

            for (let i = tBounds.min.x; i <= tBounds.max.x; i++) {
                for (let j = tBounds.min.y; j <= tBounds.max.y; j++) {
                    let coords = new L.Point(i, j);
                    coords.z = zoom;
                    urls.push(shadowSelf.getTileUrl(coords));
                }
            }
            return urls;
        },

        _preload_getNumTiles: function (map, bounds, ztList) {
            var _this      = this,
                zoom_tiles = {},  //= {zoom: numTiles}: Reuse number from same zoom but different time
                result     = 0;

            (ztList || this._preload_ztList).forEach(zt => {
                if (zoom_tiles[zt.zoom])
                    result += zoom_tiles[zt.zoom];
                else {
                    let tBounds = _this.getTileBounds(map, bounds, zt.zoom, zt.reducedBounds);
                    if (tBounds){
                        var numTiles = (tBounds.max.x - tBounds.min.x + 1) * (tBounds.max.y - tBounds.min.y + 1);
                        result += numTiles;
                        zoom_tiles[zt.zoom] = numTiles;
                    }
                }
            });
            return result;
        },

        _preload_shadowSelf: function (map) {
            if (!this._shadowSelf){
                //Create shadow version of this
                this._shadowSelf = L.tileLayer(this._url, this.options);
                this._shadowSelf._map = map;
            }
            return this._shadowSelf;
        },

        _preload_resetShadowSelf: function () {
            return this;
        },

        _preload_include_z: function( zt ){
            return ((this.options.minZoom <= zt.zoom) && (zt.zoom <= this.options.maxZoom));
        },

        _preload_include_t: function( zt ){
            return zt.time == 0;
        },

        _preload_controlObject: function (ztList, map, bounds) {
            var _this = this;
            if (this._shadowSelf)
                this._preload_resetShadowSelf();
            else
                this._preload_shadowSelf(map);

            this._preload_ztList = [];
            ztList.forEach( zt => {
                if (_this._preload_include_z(zt) && _this._preload_include_t(zt))
                    _this._preload_ztList.push(zt);
            });

            return {
                cancelled: false,
                status   : null,
                // Layer that isn't on map
                layer    : this._shadowSelf,
                map      : map,
                bounds   : bounds,
                ztList   : this._preload_ztList, //ztList,
                numTiles : this._preload_getNumTiles(map, bounds),
                success  : 0,
                failed   : 0,
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

            var start = 0, stop = chunkSize, nSuccess = 0, nFailed = 0;

            if (!controlObject.cancelled){
                var urls = [];
                controlObject.status = 'running';
                controlObject.ztList.forEach((zt) => {
                    let _urls = this._getTileUrls(controlObject.map, controlObject.bounds, zt);
                    urls.push(..._urls);
                });

                while (start < urls.length && (!controlObject.cancelled)) {
                    var chunkSuccess = 0, chunkFailed = 0, badUrls = [];
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
                            chunkFailed += 1;

                            badUrls.push(res.reason.src);
                        }
                        else {
                            nSuccess += 1;
                            chunkSuccess += 1;
                        }
                    });
                    start += chunkSize;
                    stop += chunkSize;

                    controlObject.map._preload_fire({
                        event         :'preload:tilechunk',
                        preloadOptions: controlObject.preloadOptions,
                        success       : chunkSuccess,
                        failed        : chunkFailed
                    });


                }
            }

            controlObject.success = nSuccess;
            controlObject.failed = nFailed;

            if (!controlObject.cancelled)
                controlObject.status = 'finished';

            controlObject.map._preload_fire({
                event         : 'preload:layer:'+controlObject.status,
                preloadOptions: controlObject.preloadOptions,
                success       : 0,
                failed        : 0
            });

            return controlObject;
        },

    });

    /********************************************************
    L.TileLayer.WMS
    Extend methods for wms-layers
    ********************************************************/
    L.TileLayer.WMS.include({

        _getTileUrls: function ( tileLayer__getTileUrls ){
            return function( map, bounds, zt ) {
                if (this.wmsParams && this.wmsParams.time){
                    var shadowSelf = this._preload_shadowSelf(map),
                        nextTime   = new Date(this.wmsParams.time);

                    //TODO: options for time step set in min
                    nextTime.setHours(nextTime.getHours() + zt.time);
                    shadowSelf.setParams({ time: nextTime.toISOString() }, true);
                }
                return tileLayer__getTileUrls.call(this, map, bounds, zt );
            };
        }( L.TileLayer.prototype._getTileUrls ),


        _preload_shadowSelf: function (map){
            if (!this._shadowSelf){
                var lyr = this._shadowSelf = L.tileLayer.wms(this._url, this.options);

                //Includes other named wms-options that may have been changed since creation
                ['wmsParams'].forEach(id => {
                    lyr[id] = $.extend(true, {}, this[id] || {});
                });

                lyr.wmsParams_original = $.extend({}, lyr.wmsParams);

                lyr._map = map;
                lyr._crs = this.options.crs || map.options.crs;
                lyr._wmsVersion = parseFloat(this.wmsParams.version);
                const projectionKey = this._wmsVersion >= 1.3 ? 'crs' : 'srs';
                lyr.wmsParams[projectionKey] = this._crs.code;
            }
            return this._shadowSelf;
        },

        _preload_resetShadowSelf: function(){
            this._shadowSelf.setParams(this.wmsParams, true);
        },

        _preload_include_t: function( zt ){
            //TODO: Skal checke om alle times in timestampList er indefor laget s range
            if (this.wmsParams && this.wmsParams.time){
                return true;
            }
            else
                return zt.time == 0;
        }
    });

    /***************************************************
    ****************************************************
    L.Map
    ****************************************************
    ***************************************************/
    L.Map.include({
// HER>         preparePreload_OLD: function (minZoom, maxZoom, bounds = null, layers = null) {
// HER>             var zoomList = [];
// HER>             for (let z = minZoom; z <= maxZoom; z++)
// HER>                 zoomList.push(z);
// HER>             return this.preparePreloadZoomList(zoomList, bounds, layers);
// HER>         },

        _preload_preloadObject: function(ztList, bounds, layers) {
            var numTiles       = 0,
                controlObjects = [];
            bounds = bounds || this.getBounds();

            if (!layers) {
                layers = [];
                this.eachLayer(lyr => {
                    if (!lyr.options.preloadExclude){
                        lyr.options.preloadSortValue = lyr.options.preloadSortValue || (lyr.options.priloadPrimary ? 10 : 0) + (lyr.options.preloadMainLayer ? 1 : 0);
                        layers.push(lyr);
                    }
                });

                //Sort layer
                layers.sort( (lyr1, lyr2) => { return lyr2.options.preloadSortValue - lyr1.options.preloadSortValue; });
            }

            for (let lyr of layers) {
                if (lyr instanceof L.TileLayer) {
                    let cObj = lyr._preload_controlObject(ztList, this, bounds);
                    controlObjects.push(cObj);
                    numTiles += cObj.numTiles;
                }
            }

            var result = {
                numTiles      : numTiles,
                map           : this,
                controlObjects: controlObjects,
                preload: function (options) {
                    return this.map.preloadLayers(result, options);
                },
                cancel : function () {
                    for (let cObj of this.controlObjects) {
                        cObj.cancel();
                    }
                }
            };
            return result;
        },

        preloadLayers: async function (preloadObject, options) {
            /* Wrapper of L.TileLayer.preload */
            var controlObjects = preloadObject.controlObjects,
                success = 0,
                failed = 0;
            for (let cObj of controlObjects) {
                let res = await cObj.preload(options.chunkSize, options.sleep);

                if (!res.cancelled){
                    success += res.success;
                    failed += res.failed;
                }
            }
            var event = controlObjects.some(cObj => cObj.cancelled) ? 'cancelled' : 'finished';
            this._preload_fire({
                event         : 'preload:'+event,
                preloadOptions: preloadObject.preloadOptions,
                success       : success,
                failed        : failed,
                fullUpdate    : true
            });
        },


        /*****************************************
        Automatic preload
        *****************************************/
        _preload_init: function(){
            if (this._preload_initialized) return;

            var preloadOptions = this.options.preloadOptions = $.extend(true, {}, L.Map.prototype.options.preloadOptions, this.options.preloadOptions);

            //Adjust fullBounds
            preloadOptions.fullBounds = Array.isArray(preloadOptions.fullBounds) ? preloadOptions.fullBounds : [preloadOptions.fullBounds];

            //Create _preload_list = []{options and status}
            this._preload_list = [];
            preloadOptions.list.forEach( preloadOpt => {
                var newOptions = $.extend({
                        index    : this._preload_list.length,
                        total    : 0,
                        processed: 0,
                        success  : 0,
                        failed   : 0
                    }, preloadOpt );
                newOptions.chunkSize = newOptions.chunkSize || preloadOptions.chunkSize || 8;
                newOptions.sleep     = newOptions.sleep     || preloadOptions.sleep     || 100;

                this._preload_list.push( newOptions );
            });

            this.on('layeradd',                this._preload_on_layeradd);

            this.on('preload:finished',        this._preload_finished);
            this.on('preload:cancelled',       this._preload_finished);

            this.on('preload:timechanged',     this._preload_timechanged);


            this._preload_initialized = true;
        },


        /*****************************************
        _preload_on_layeradd
        Check if the added layer is preloadMainLayer
        *****************************************/
        _preload_on_layeradd: function(/*e*/){
            var _this = this;
            this.eachLayer(function(layer){
                if (layer.options.preloadMainLayer){
                    layer.on('loading', _this._preload_mainlayer_on_loading.bind(_this));
                    _this._preload_mainlayer_on_loading();
                    _this.off('layeradd', _this._preload_on_layeradd);
                }
            });
        },

        _preload_mainlayer_on_loading: function(/*event*/){
            this._preload_list.forEach( preloadOptions => {
                if (preloadOptions.preloadObject)
                    preloadOptions.preloadObject.cancel();
            });

            if (this.preloadTimeoutId)
                window.clearTimeout(this.preloadTimeoutId);

            this.preloadTimeoutId = window.setTimeout( this._preload_start.bind(this), this.options.preloadOptions.timeout);
        },


        /*****************************************
        _preload_start
        *****************************************/
        _preload_start: function(){
            if (!this.options.preload) return;

            //Update preload-options in _preload_list with current to- and from zoom and time
            var mapMinZoom = this.getMinZoom(),
                mapZoom    = this.getZoom(),
                zoomIn     = mapZoom,
                zoomOut    = mapZoom,
                mapMaxZoom = this.getMaxZoom(),

                timeForward  = 0,
                timeBackward = 0,
                fullBounds   = this.options.preloadOptions.fullBounds,

                zts = {};

            this._preload_list.forEach( preloadOpt => {
                var range = preloadOpt.range = {};

                preloadOpt.range.zoomIn = {};
                preloadOpt.range.zoomIn.start = zoomIn;
                preloadOpt.range.zoomIn.end   = Math.min( mapMaxZoom, zoomIn + preloadOpt.zoomIn );
                zoomIn = preloadOpt.range.zoomIn.end;

                preloadOpt.range.zoomOut = {};
                preloadOpt.range.zoomOut.start = zoomOut;
                preloadOpt.range.zoomOut.end   = Math.max( mapMinZoom, zoomOut - preloadOpt.zoomOut );
                zoomOut = preloadOpt.range.zoomOut.end;

                preloadOpt.range.timeForward = {};
                preloadOpt.range.timeForward.start = timeForward;
                preloadOpt.range.timeForward.end   = timeForward + preloadOpt.timeForward;
                timeForward = preloadOpt.range.timeForward.end;

                preloadOpt.range.timeBackward = {};
                preloadOpt.range.timeBackward.start = timeBackward;
                preloadOpt.range.timeBackward.end   = timeBackward - preloadOpt.timeBackward;
                timeBackward = preloadOpt.range.timeBackward.end;

                //Create sorted list of {zoom,time}
                var ztList = [];
                [{range: 'zoomIn', weight: .7}, {range: 'zoomOut', weight: 0.8}].forEach( zoom => {
                    [{range: 'timeForward', weight: 0.9}, {range: 'timeBackward', weight: 1}].forEach( time => {

                        var zRange  = range[zoom.range],
                            zStart  = zRange.start,
                            zEnd    = zRange.end,
                            dz      = zStart <= zEnd ? +1 : -1,
                            z       = zStart,
                            zWeight = zoom.weight,

                            tRange  = range[time.range],
                            tStart  = tRange.start,
                            tEnd    = tRange.end,
                            dt      = tStart <= tEnd ? +1 : -1,
                            t       = tStart,
                            tWeight = time.weight;


                        while (dz > 0 ? z <= zEnd : z >= zEnd){
                            t = tStart;
                            while (dt > 0 ? t <= tEnd : t >= tEnd){
                                var ztId = z+'-'+t;
                                if (!zts[ztId] && ((z != mapZoom) || t) ){


                                    ztList.push({
                                        zoom         : z,
                                        time         : t,
                                        reducedBounds: fullBounds.length ? !fullBounds.includes(z - mapZoom) : true,
                                        weight       : Math.sqrt( Math.pow( (z - mapZoom)*zWeight, 2) + Math.pow(t*tWeight, 2) ),
                                    });
                                    zts[ztId] = true;
                                }
                                t = t + dt;
                            }
                            z = z + dz;
                        }
                    });
                });

                ztList.sort( (zt1, zt2) => { return zt1.weight - zt2.weight; });

                preloadOpt.ztList = [];
                preloadOpt.ztList.push(ztList[0]);
                var last_zt = ztList[0];
                ztList.forEach( (zt, index) => {
                    if (index && ((zt.zoom != last_zt.zoom) || (zt.time != last_zt.time)) ){
                        last_zt = zt;
                        preloadOpt.ztList.push(zt);
                    }
                });
            }); //end of this._preload_list.forEach(...

            this._preload_start_preloadOptions(0);
        },

        _preload_start_preloadOptions: function(index){
            var preloadOptions = this._preload_list[index];

            if (preloadOptions.preloadObject)
                preloadOptions.preloadObject.cancel();

            var preloadObject = preloadOptions.preloadObject = this._preload_preloadObject(preloadOptions.ztList);

            //Set ref to preloadOptions
            preloadObject.preloadOptions = preloadOptions;
            preloadObject.controlObjects.forEach( cObj => {
                cObj.preloadOptions = preloadOptions;
            });

            //Reset status
            var status = preloadOptions.status = preloadOptions.status || {index: index};
            $.extend(status, {
                total    : preloadObject.numTiles,
                processed: 0,
                success  : 0,
                failed   : 0,
                start    : Date.now(),
                duration : 0,
                expected : preloadObject.numTiles * (status.msProImg || 0)
            });

            var expectedDuration = status.expected;

            _debug(
                'Preload #'+index+': START loading '+status.total+ ' images.',
                expectedDuration ? 'Expected duration ='+Math.round(expectedDuration) : ''
            );


            if (
                (expectedDuration < this.options.preloadOptions.maxDuration) ||
                (Date.now() > ((status.end || 0) + this.options.preloadOptions.wait))
            )
                preloadObject.preload(this.options.preloadOptions);
            else
                _debug(
                    'Preload #'+index+': STOPPED '+status.total+ ' images.',
                    'Expected duration='+Math.round(expectedDuration)+'>'+this.options.preloadOptions.maxDuration);
        },


        _preload_fire: function(event){
            var status = event.preloadOptions.status;
            if (event.fullUpdate){
                status.processed = event.success + event.failed;
                status.success   = event.success;
                status.failed    = event.failed;
                status.end       = Date.now();
                status.duration  = status.end - status.start;

                //Calc ms pro image if more than 80% of the images where loaded
                if (status.processed / status.total > .8)
                    status.msProImg = status.total ? status.duration / status.total : 0;
            }
            else {
                status.processed += event.success + event.failed;
                status.success   += event.success;
                status.failed    += event.failed;
            }
            status.eventType = event.event;

            this._preload_update_status(status);

            this.fire(status.eventType, status);
        },

        _preload_finished: function(status){
            if ( (status.eventType == 'preload:finished') && (status.index+1 < this._preload_list.length))
                //Preload next preloadOptions from list
                this._preload_start_preloadOptions(status.index + 1);
        },


        _preload_timechanged: function(){
            _debug('time changed');
            this._preload_mainlayer_on_loading();
        },

        _preload_update_status: function(status){
            if (L.preloadDEBUG){
                if (status.eventType != 'preload:tilechunk'){
                    var finish = (status.eventType == 'preload:finished') || (status.eventType == 'preload:cancelled');
                    _debug(
                        'Preload #'+status.index+': Status='+status.eventType,
                        status.processed + '/' + status.total,
                        finish ? 'in ' + status.duration+'ms (' + Math.round(status.duration/1000)+'s)' : '',
                        finish && status.expected ? '(Expected=' + Math.round(status.expected)+')' : '',
                        finish && status.processed ? '=> ' + Math.round(status.duration / status.processed) + ' ms/img' : ''
                    );
                }
            }

            //TODO Call options.onStatus-function
        },
    });


    L.Map.mergeOptions({
        preload       : false,
        preloadOptions: {
            chunkSize   : 8,
            sleep       : 100,
            timeout     : 500,
            fullBounds  : 1,
            maxDuration : 10000,
            wait        : 30000,
            list      : [{
                zoomIn      : 1,
                zoomOut     : 0,
                timeForward : 1,
                timeBackward: 0
            },{
                zoomIn      : 1,
                zoomOut     : 0,
                timeForward : 1,
                timeBackward: 0
            },{
                zoomIn      : 1,
                zoomOut     : 0,
                timeForward : 1,
                timeBackward: 0
            }]
        }
    });

    L.Map.addInitHook(function () {
        if (this.options.preload)
            this._preload_init();
    });

}(jQuery, L/*,this, document*/));



