/* Storymode, "The Gentle Turning": berättelsen som data. Än så länge tom; kapitlen fylls på när texterna är klara.
   Allt spelaren läser skrivs här som engelsk text, och texten är själva översättningsnyckeln (se lang/lang.js): när ett kapitel är klart
   läggs dess texter in i alla språkfiler, precis som övriga texter. Text som ska översättas får alltså inte byggas ihop av delar.
   prologue / epilogue: stycken.
   chapters: ett per bana, { name, letter, dialogue, ... }. */
(function (CityBuilder) {
  'use strict';

  CityBuilder.Config.story = {
    title: 'The Gentle Turning',
    prologue: [],
    chapters: [],
    epilogue: [],
  };
})(window.CityBuilder);
