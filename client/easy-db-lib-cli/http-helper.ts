export function request(url: string, params:object|string='', method: string = 'GET'): Promise<any> {
    method = method.toUpperCase();

    let http = new XMLHttpRequest();
    http.open(method, url, true);

    if (method === 'GET') {
        if (typeof params === 'object') {
            params = Object.keys(params)
                .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
                .join('&');
        }
        let separator = url.indexOf('?') > -1 ? '&' : '?';
        let insertPosition = url.indexOf('#') > -1 ? url.indexOf('#') : url.length;

        if (params.length > 0) {
            url = url.substr(0, insertPosition) + separator + params + url.substr(insertPosition);
        }
    } else {
        if (typeof params === 'string') {
            http.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
        }
        else {
            params = JSON.stringify(params);
            http.setRequestHeader('Content-type', 'application/json');
        }
    }

    return new Promise((resolve, reject) => {
        http.onreadystatechange = function() {
            if (http.readyState == 4) {
                if (http.status >= 200 && http.status < 300 || http.status === 304) {
                    let result: any;
                    try {
                        result = JSON.parse(http.responseText);
                    } catch (e) {
                        result = http.responseText;
                    }

                    resolve(result);
                }
                else {
                    reject(http.status);
                }
            }
        };
        http.send(params.toString());
    });
}