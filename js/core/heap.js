/* Binär min-heap. Element är arrayer där index 0 är prioriteten. */
(function (CityBuilder) {
  'use strict';

  CityBuilder.MinHeap = class MinHeap {
    constructor() { this.items = []; }

    get size() { return this.items.length; }

    push(item) {
      const items = this.items;
      items.push(item);
      let index = items.length - 1;
      while (index > 0) {
        const parentIndex = (index - 1) >> 1;
        if (items[parentIndex][0] <= items[index][0]) break;
        [items[parentIndex], items[index]] = [items[index], items[parentIndex]];
        index = parentIndex;
      }
    }

    pop() {
      const items = this.items, top = items[0], last = items.pop();
      if (items.length) {
        items[0] = last;
        let index = 0;
        for (;;) {
          const left = 2 * index + 1, right = left + 1;
          let smallest = index;
          if (left < items.length && items[left][0] < items[smallest][0]) smallest = left;
          if (right < items.length && items[right][0] < items[smallest][0]) smallest = right;
          if (smallest === index) break;
          [items[smallest], items[index]] = [items[index], items[smallest]];
          index = smallest;
        }
      }
      return top;
    }
  };
})(window.CityBuilder);
