export function easyDbHashFunction<T>(data: T): number {
    let str: string = typeof data === 'string' ? data : JSON.stringify(data);

    let base: number = Math.pow(2, 31) - 1;
    let p: number = 487;
    let result: number = 0;
    let pow: number = 1;
    for (let i = 0; i < str.length; i++) {
        result = (result + str.charCodeAt(i) * pow) % base;
        pow *= p;
    }
    result = (result + str.length * pow) % base;

    return result;
}