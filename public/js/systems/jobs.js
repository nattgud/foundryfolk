/* Stegbyggare för enheters stegkö:
   walkTo (gå, stopBeforeTarget = stanna före målrutan), wait (vänta, statusText visas), run (kör funktion; returnerar den false avbryts hela kön). */
(function (CityBuilder) {
  'use strict';
  CityBuilder.Jobs = {
    walkTo: (targetX, targetY, stopBeforeTarget) => ({ kind: 'walk', targetX, targetY, stopBeforeTarget }),
    wait: (seconds, statusText) => ({ kind: 'wait', secondsLeft: seconds, statusText }),
    run: action => ({ kind: 'run', action }),
    followUnit: (target, job, outputResource) => ({
      kind: 'followUnit',
      target,
      job,
      outputResource,
      targetX: Math.floor(target.x),
      targetY: Math.floor(target.y),
      stopBeforeTarget: false,
      path: null,
      pathIndex: 0,
      secondsLeft: null,
      workSeconds: job.workSeconds || 2,
      statusText: job.workLabel || 'Hunting',
    }),
  };
})(window.CityBuilder);
