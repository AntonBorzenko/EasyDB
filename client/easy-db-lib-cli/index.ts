import EasyDb from "./easy-db";

declare global {
    interface Window {
        EasyDb : EasyDb
    }
}

window.EasyDb = require('./easy-db').default;