export function debounce(func, timeout) {
    let timerId = null;
    return function (...args) {
      if (timerId) {
        clearTimeout(timerId);
      }
  
      timerId = setTimeout(() => {
        func.apply(this, args);
      }, timeout);
    }
  }