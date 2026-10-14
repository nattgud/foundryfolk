/* Stegbyggare för enheters stegkö:
   walkTo (gå, stopBeforeTarget = stanna före målrutan), wait (vänta, statusText visas), run (kör funktion; returnerar den false avbryts hela kön). */
(function (CityBuilder) {
  'use strict';
  CityBuilder.Jobs = {
    walkTo: (targetX, targetY, stopBeforeTarget) => ({ kind: 'walk', targetX, targetY, stopBeforeTarget }),
    wait: (seconds, statusText) => ({ kind: 'wait', secondsLeft: seconds, statusText }),
    run: action => ({ kind: 'run', action }),
  };
})(window.CityBuilder);
