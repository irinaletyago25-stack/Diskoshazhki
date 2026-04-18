export interface Quote {
  text: string;
  author: string;
}

export async function fetchForismaticQuote(): Promise<Quote | null> {
  return new Promise((resolve) => {
    const callbackName = 'forisCb_' + Date.now();
    const script = document.createElement('script');
    script.src = `https://api.forismatic.com/api/1.0/?method=getQuote&format=jsonp&lang=ru&jsonp=${callbackName}`;

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 5000);

    (window as any)[callbackName] = (data: any) => {
      clearTimeout(timeout);
      const text = (data.quoteText || '').trim();
      const author = (data.quoteAuthor || '').trim();
      if (text) {
        resolve({ text, author });
      } else {
        resolve(null);
      }
      cleanup();
    };

    function cleanup() {
      delete (window as any)[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    document.head.appendChild(script);
  });
}
