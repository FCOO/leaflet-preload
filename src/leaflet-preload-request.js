/****************************************************************************
leaflet-preload-request.js.js,

Create methods to request a full reload


****************************************************************************/
(function ($, L, window/*, document, undefined*/) {
    "use strict";

    function ms2DurationText( ms ){
        var s = Math.round(ms / 1000),
            result = '',
            next;

        for (var i=2; i>=0; i--){
            next = s % 60;
            s = (s - next) / 60;

            result = (next < 10 ? '0' : '') + next + (result ? ':' : '') + result;
        }
        return result;
    }


    /********************************************************
    L.preload_request
    options:

    ********************************************************/
    L.Preload = /*
    L.preload_request = */function( options ){
        this.options = {};
        this.lastEvent = {};

        this.set(options);





    };


    L.Preload.prototype = {
        getMap: function(){
            if (this.map)
                return this.map;

            this.$outerContainer =
                $('<div/>')
                    .css({position: 'absolute', left: 0, top: 0, width:'100%', height: '100%', overflow: 'hidden', visibility: 'hidden'/*, display: 'none'*/})
                    .appendTo( $('body') ),
            this.$container =
                $('<div/>')
                    .width(this.options.width || window.screen.width)
                    .height(this.options.height || window.screen.height)
                    .appendTo( this.$outerContainer );
            this.map = L.map(this.$container.get(0)).setView([56.0, 7.0], 3);

            this.map.on('preload:tilechunk', this._on_preload_tilechuck.bind(this));
            this.map.on('preload:finished',  this._on_preload_finished.bind(this));
            this.map.on('preload:cancelled', this._on_preload_cancelled.bind(this));

            return this.map;
        },

        removeMap: function(){
            if (this.map){
                this.map.remove();
                this.map = null;
                this.$outerContainer.remove();
            }
            return this;
        },

        getPreloadOptions: function(/*options*/){
            var map = this.getMap();

            map.fitBounds( this.options.bounds );
            map.options.preloadOptions.fullBounds = true;
            map.options.preloadOptions.list = [{
                zoomIn      : Math.min(this.options.maxZoom - map.getZoom(), this.options.maxZooms || 99),
                zoomOut     : 0,
                timeForward : this.options.timeForward  || 0,
                timeBackward: this.options.timeBackward || 0
            }];

            map._preload_init();
            map._preload_update_list();

            this.preloadOptions = map._preload_start_preloadOptions(0, this.options.bounds, this.options.layers, true);

            return this.preloadOptions;
        },

        set: function(options){
            this.options = $.extend(this.options, options);
            this.getPreloadOptions();
            this.numTiles = this.tiles = this.options.tiles = this.options.numTiles = this.preloadOptions.preloadObject.numTiles;

            this.preloadOptions = null;
            this.removeMap();

            return this;
        },

        start: function(options){
            if (options)
                this.set(options);
            this.getPreloadOptions();

            this.status = {
                total    : this.numTiles,
                processed: 0,
                success  : 0,
                start    : Date.now()
            };

            if (this.options.onStart)
                this.options.onStart(this);

            this.loading = true;
            this.preloadOptions.preloadObject.preload(this.preloadOptions);

        },

        stop: function(){
            this.preloadOptions.preloadObject.cancel();
        },


        _on: function(id, status){
            if (!this.options['on'+id]) return false;

            if (status){
                this.status.processed = status.processed;
                this.status.success   = status.success;
                this.status.failed    = status.failed;
            }

            var now = Date.now(),
                callEvent = true;

            //Only call event if extra 1% is precessed OR 2 sec has passed
            if (this.lastEvent[id])
                callEvent = (
                    ( (this.status.processed - this.lastEvent[id].processed) > (this.numTiles/100) ) ||
                    ( (now - this.lastEvent[id].time) > 2000 )
                );

            if (callEvent){
                this.status.text = this.status.processed+'/'+this.numTiles;

                this.status.percent     = Math.ceil(100 * this.status.processed / this.numTiles);
                this.status.percentText = this.status.percent+'%';

                this.status.duration = now - this.status.start;
                this.status.durationText = ms2DurationText(this.status.duration);

                this.status.expectedDuration = this.status.duration / this.status.processed * this.numTiles;
                //Experince and test show that the first tiles are faster downloaded that the last ones
                //To give at 'better' expected duration a factor is use to adjust: 1.5 at 0% and 1 at 85%
                var pOff = 85;
                if (this.status.percent <= pOff){
                    var p = this.status.percent;
                    this.status.expectedDuration = this.status.expectedDuration * (0.5 / (pOff*pOff) * (p-pOff)*(p-pOff) + 1);
                }

                this.status.expectedDurationText = ms2DurationText(this.status.expectedDuration);

                this.status.expectedDurationLeft     = this.status.expectedDuration - this.status.duration;
                this.status.expectedDurationLeftText = ms2DurationText(this.status.expectedDurationLeft);

                this.lastEvent[id] = {
                    processed : this.status.processed,
                    time      : now
                };

                this.options['on'+id](this.status, this);
            }
            return true;
        },

        _on_preload_tilechuck: function( status ){
            return this._on('Update', status );
        },

        _on_preload_finished: function(){
            this.loading = false;
            return this._on('Finished');
        },

        _on_preload_cancelled: function(){
            this.loading = false;
            return this._on('Cancelled') || this._on('Finished');
        },
    };

}(jQuery, L, this/*, document*/));



