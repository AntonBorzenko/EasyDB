import EasyDb from "./easy-db";
import EasyDbModel from "./easy-db-model";

declare global {
    interface Window {
        EasyDb : typeof EasyDb,
        EasyDbModel: typeof EasyDbModel
    }
}

window.EasyDb = EasyDb;
window.EasyDbModel = EasyDbModel;