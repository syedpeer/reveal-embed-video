/**
 * reveal-embed-video.js is a plugin to include an live video stream (from a webcam) in
 * reveal.js slides.
 *
 * @namespace EmbedVideo
 * @author ThomasWeinert
 * @license MIT
 * @see {@link http://thomas.weinert.info/reveal-embed-video/|GitHub} for documentation, bug reports and more.
 */

'use strict';

/**
 * Plugin initialization
 * @function
 */
(function() {

  /**
   * @param {HTMLVideoElement} video
   * @param {boolean} persistent Keep stream for disabled video
   * @constructor
   * @memberOf EmbedVideo
   */
  var LiveStream = function(video, persistent) {
    this.__video = video;
    this.__stream = null;
    this.__status = LiveStream.STATUS.DISABLED;
    this.__persistent = persistent;
    this.__devices = null;
    this.__currentDeviceId = null;
  };

  /**
   * @typedef {number} LiveStream.STATUS
   */

  /**
   * @enum {LiveStream.STATUS}
   */
  LiveStream.STATUS = {
    DISABLED: 0,
    PENDING: 1,
    ACTIVE: 2,
    ERROR: -1
  };

  /**
   * Start streaming, activate an existing stream or create a new one.
   * If here is an active stream this call will do nothing.
   */
  LiveStream.prototype.start = function() {
    if (this.__status === LiveStream.STATUS.DISABLED) {
      if (this.__stream) {
        this.__enable();
      } else {
        this.__create();
      }
    }
  };

  /**
   * Check if the stream is active
   * @returns {boolean}
   */
  LiveStream.prototype.isActive = function() {
    return this.__status === LiveStream.STATUS.ACTIVE;
  };

  /**
   * Stop video stream and disable video
   */
  LiveStream.prototype.stop = function() {
    if (this.__status === LiveStream.STATUS.ACTIVE) {
      this.__destroy();
    }
  };

  /**
   * Switch to the next video device
   */
  LiveStream.prototype.next = function() {
    var deviceId;
    if (
        this.__devices instanceof Array &&
        this.__devices.length > 1
    ) {
      deviceId = this.__devices[0];
      if (this.__currentDeviceId) {
        var index = this.__devices.indexOf(this.__currentDeviceId);
        if (index >= 0 && index + 1 < this.__devices.length) {
          deviceId = this.__devices[index + 1];
        }
      }
    }
    if (deviceId && deviceId !== this.__currentDeviceId) {
      this.__currentDeviceId = deviceId;
      if (this.__stream) {
        this.__stream.getTracks().forEach(
            function(track) { track.stop(); }
        );
        this.__stream = null;
      }
      if (this.isActive()) {
        this.__create();
      }
    }
  };

  /**
   * Activate video after Reveal is ready, wait with video activation until then
   * @private
   */
  LiveStream.prototype.__enable = function() {
    if (!Reveal.isReady()) {
      Reveal.addEventListener(
          'ready',
          this.__enable().bind(this)
      );
    } else if (this.__stream) {
      var video = this.__video;
      if (video.srcObject !== this.__stream) {
        video.pause();
        video.srcObject = this.__stream;
      }
      video.setAttribute('data-enabled', 'true');
      if (!video.playing) {
        video.play();
      }
      this.__status = LiveStream.STATUS.ACTIVE;
    }
  };

  /**
   * Fetch device list and create user media stream
   * @private
   */
  LiveStream.prototype.__create = function() {
    var constraints = {
      audio: false,
      video: true
    };
    this.__status = LiveStream.STATUS.PENDING;
    if (null === this.__devices) {
      this.__devices = [];
      navigator
          .mediaDevices
          .enumerateDevices()
          .then(
              function(devices) {
                for (var i = 0, c = devices.length; i < c; i++) {
                  if (devices[i].kind.toLowerCase() === 'videoinput') {
                    this.__devices.push(devices[i].deviceId);
                  }
                }
              }.bind(this)
          );
    }
    if (this.__currentDeviceId) {
      constraints.video = { deviceId: this.__currentDeviceId };
    }
    navigator
        .mediaDevices
        .getUserMedia(constraints)
        .then(
            function(stream) {
              this.__stream = stream;
              this.__currentDeviceId = stream.getVideoTracks()[0].getSettings().deviceId;
              this.__enable();
            }.bind(this)
        )
        .catch(
            function(error) {
              console.log('getUserMedia error: ', error);
              this.__status = LiveStream.STATUS.ERROR;
            }.bind(this)
        );
  };

  /**
   * Pause video, remove enabled status and stop stream
   * @private
   * @returns {void}
   */
  LiveStream.prototype.__destroy = function() {
    var video = this.__video;
    if (video instanceof HTMLVideoElement) {
      if (video.playing) {
        video.pause();
      }
      video.srcObject = null;
      video.removeAttribute('data-enabled');
      video.load();
      if (this.__stream && !this.__persistent) {
        this.__stream.getTracks().forEach(
            function(track) { track.stop(); }
        );
        this.__stream = null;
      }
    }
    this.__status = LiveStream.STATUS.DISABLED;
  };

  /**
   * @param {EmbedVideo.Plugin.Options} options
   * @constructor
   * @memberOf EmbedVideo
   */
  var Plugin = function(options) {
    /**
     * Plugin be enabled
     * @type {boolean}
     * @private
     */
    this.__enabled = options.enabled;
    /**
     * Shortcuts registered
     * @type {boolean}
     * @private
     */
    this.__registered = false;
    var resource = document.createElement('link');
    resource.rel = 'stylesheet';
    resource.href = options.path + '/reveal-embed-video.css';
    document.querySelector('head').appendChild(resource);
    /**
     * Class to identify the video element (avoid conflicts with other videos)
     * @type {string}
     * @private
     */
    this.__identfierClass = 'live-video';
    /**
     * @type {HTMLVideoElement}
     * @private
     */
    this.__video = document.querySelector('.reveal').appendChild(
        document.createElement('video')
    );
    this.__video.setAttribute('class', this.__identfierClass);
    this.__video.addEventListener(
        'click',
        function() {
          this.__stream.next();
        }.bind(this)
    );
    /**
     * @type {LiveStream}
     * @private
     */
    this.__stream = new LiveStream(this.__video, options.persistent);
    Reveal.addEventListener('ready', this.update.bind(this));
    Reveal.addEventListener('slidechanged', this.update.bind(this));
  };

  /**
   * Toggle the plugin between enabled/disabled
   */
  Plugin.prototype.toggle = function() {
    this.__enabled = !this.__enabled;
    this.update();
    return this.__enabled;
  };

  /**
   * Update plugin status in DOM and Reveal
   * @returns {void}
   */
  Plugin.prototype.update = function() {
    if (!this.__registered) {
      this.__registered = true;
      Reveal.registerKeyboardShortcut('C', 'Toggle speaker camera');
      Reveal.configure(
          {
            keyboard: {
              67: this.toggle.bind(this)
            }
          }
      );
    }
    var newVideoClass = this.getVideoClass(Reveal.getCurrentSlide());
    var enabled = this.__enabled && newVideoClass;
    if (this.__stream.isActive() && !enabled) {
      this.__video.setAttribute('class', this.__identfierClass);
      this.__stream.stop();
    }
    if (enabled) {
      this.__video.setAttribute('class', this.__identfierClass + ' ' + newVideoClass);
      this.__stream.start();
    }
  };

  /**
   * Fetch the slide specific style class for the video element
   * from the `data-video` attribute.
   *
   * @param {HTMLElement} element
   * @returns {(string|boolean)}
   */
  Plugin.prototype.getVideoClass = function(element) {
    if (element instanceof Element) {
      var nodeVideoClass = element.getAttribute('data-video');
      /**
       * @type {HTMLElement|ParentNode}
       */
      var node = element;
      do {
        nodeVideoClass = node.getAttribute('data-video');
        node = node.parentNode;
      } while (!nodeVideoClass && node);
      element.setAttribute('data-video', nodeVideoClass || 'false');
      return (
          nodeVideoClass &&
          nodeVideoClass !== 'false' &&
          nodeVideoClass !== 'blank'
      ) ? nodeVideoClass : false;
    }
    return false;
  };

  /**
   * obtain plugin path from the script element
   * @returns {string}
   */
  var getScriptPath = function() {
    var path;
    var end = -('/reveal-embed-video.js'.length);
    if (document.currentScript && document.currentScript['src']) {
      path = document.currentScript['src'].slice(0, end);
    } else {
      var scriptTag = document.querySelector('script[src$="/reveal-embed-video.js"]');
      if (scriptTag) {
        path = scriptTag.src.slice(0, end);
      }
    }
    return path;
  };

  var config = Reveal.getConfig();

  /**
   * @typedef EmbedVideo.Plugin.Options
   * @property {boolean} enabled
   * @property {boolean} persistent
   * @property {string} path
   */

  /**
   * @type {EmbedVideo.Plugin.Options}
   */
  var options = config['embed-video'] || {};
  options.enabled = !!options.enabled; // enable live video (toggle with [C])
  options.persistent = !!options.persistent; // keep camera active if hidden
  options.path = options.path || getScriptPath() || 'plugin/reveal-embed-video';

  new Plugin(options);

})();
