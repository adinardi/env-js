/*
*	timer.js
*/

$debug("Initializing Window Timer.");

//private
var $timers = $env.timers = $env.timers || [];
var $event_loop_running = false;
$timers.lock = $env.sync(function(fn){fn();});

var $timer = function(fn, interval){
  this.fn = fn;
  this.interval = interval;
  this.at = Date.now() + interval;
  this.running = false; // allows for calling wait() from callbacks
};
  
$timer.prototype.start = function(){};
$timer.prototype.stop = function(){};

var convert_time = function(time) {
  time = time*1;
  if ( isNaN(time) || time < 0 ) {
    time = 0;
  }
  // html5 says this should be at least 4, but the parser is using a setTimeout for the SAX stuff
  // which messes up the world
  var min = /* 4 */ 0;
  if ( $event_loop_running && time < min ) {
    time = min;
  }
  return time;
}

$w.setTimeout = function(fn, time){
  var num;
  time = convert_time(time);
  $timers.lock(function(){
    num = $timers.length+1;
    var tfn;
    if (typeof fn == 'string') {
      tfn = function() {
        try {
          eval(fn);
        } catch (e) {
          $env.error(e);
        } finally {
          $w.clearInterval(num);
        }
      };
    } else {
      tfn = function() {
        try {
          fn();
        } catch (e) {
          $env.error(e);
        } finally {
          $w.clearInterval(num);
        }
      };
    }
    $debug("Creating timer number "+num);
    $timers[num] = new $timer(tfn, time);
    $timers[num].start();
  });
  return num;
};

$w.setInterval = function(fn, time){
  time = convert_time(time);
  if ( time < 10 ) {
    time = 10;
  }
  if (typeof fn == 'string') {
    var fnstr = fn; 
    fn = function() { 
      eval(fnstr);
    }; 
  }
  var num;
  $timers.lock(function(){
    num = $timers.length+1;
    //$debug("Creating timer number "+num);
    $timers[num] = new $timer(fn, time);
    $timers[num].start();
  });
  return num;
};

$w.clearInterval = $w.clearTimeout = function(num){
  //$log("clearing interval "+num);
  $timers.lock(function(){
    if ( $timers[num] ) {
      $timers[num].stop();
      delete $timers[num];
    }
  });
};	

// wait === null/undefined: execute any timers as they fire, waiting until there are none left
// wait(n) (n > 0): execute any timers as they fire until there are none left waiting at least n ms
// but no more, even if there are future events/current threads
// wait(0): execute any immediately runnable timers and return
// wait(-n): keep sleeping until the next event is more than n ms in the future

// FIX: make a priority queue ...

$w.$wait = $env.wait = $env.wait || function(wait) {
  var delta_wait;
  if (wait < 0) {
    delta_wait = -wait;
    wait = 0;
  }
  var start = Date.now();
  var old_loop_running = $event_loop_running;
  $event_loop_running = true; 
  if (wait !== 0 && wait !== null && wait !== undefined){
    wait += Date.now();
  }
  for (;;) {
    var earliest;
    $timers.lock(function(){
      earliest = undefined;
      for(var i in $timers){
        if( isNaN(i*0) ) {
          continue;
        }
        var timer = $timers[i];
        if( !timer.running && ( !earliest || timer.at < earliest.at) ) {
          earliest = timer;
        }
      }
    });
    var sleep = earliest && earliest.at - Date.now();
    if ( earliest && sleep <= 0 ) {
      var f = earliest.fn;
      try {
        earliest.running = true;
        f();
      } catch (e) {
        $env.error(e);
      } finally {
        earliest.running = false;
      }
      var goal = earliest.at + earliest.interval;
      var now = Date.now();
      if ( goal < now ) {
        earliest.at = now;
      } else {
        earliest.at = goal;
      }
      continue;
    }

    // bunch of subtle cases here ...
    if ( !earliest ) {
      // no events in the queue (but maybe XHR will bring in events, so ...
      if ( !wait || wait < Date.now() ) {
        // Loop ends if there are no events and a wait hasn't been requested or has expired
        break;
      }
      // no events, but a wait requested: fall through to sleep
    } else {
      // there are events in the queue, but they aren't firable now
      if ( delta_wait && sleep <= delta_wait ) {
        // if they will happen within the next delta, fall through to sleep
      } else if ( wait === 0 || ( wait > 0 && wait < Date.now () ) ) {
        // loop ends even if there are events but the user specifcally asked not to wait too long
        break;
      }
      // there are events and the user wants to wait: fall through to sleep
    }

    // Related to ajax threads ... hopefully can go away ..
    var interval =  $wait.interval || 100;
    if ( !sleep || sleep > interval ) {
      sleep = interval;
    }
    java.lang.Thread.currentThread().sleep(sleep);
  }
  $event_loop_running = old_loop_running;
};

