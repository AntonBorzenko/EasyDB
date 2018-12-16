import EasyDb from "./easy-db";
import {deepClone} from "fast-json-patch/lib/core";

export interface ModelStorage {
    nextId : number,
    obj: object,
}

interface ModelsCollection {

}

interface DataWithModels {
    m?: ModelsCollection;
}

export interface ObjectWithId extends Object {
    id?: string;
}

export default class EasyDbModel {
    private static _edb: EasyDb = null;
    static get edb(): EasyDb {
        return EasyDbModel._edb;
    }

    static setEasyDb(edb: EasyDb): void {
        EasyDbModel._edb = edb;
    }

    private static _storageName: string;
    private static _storageNameObject: typeof EasyDbModel;

    static getStorageName(): string {
        if (this._storageNameObject !== this) {
            this._storageName =
                this.name === EasyDbModel.name
                    ? 'default'
                    : this.name.toLowerCase().replace('model', '');
            this._storageNameObject = this;
        }
        return this._storageName;
    }

    static getStorage(edb?: EasyDb): ModelStorage {
        let data = <DataWithModels>this._getEdb(edb).data;
        if (!data.m) {
            data.m = {};
        }
        if (!data.m[this.getStorageName()]) {
            data.m[this.getStorageName()] = <ModelStorage>{
                nextId : 1,
                obj: {}
            };
        }
        return data.m[this.getStorageName()];
    }

    static getAll(edb?: EasyDb): EasyDbModel[] {
        let storage = this.getStorage(edb);
        return Object.keys(storage.obj)
            .map(id => {
                return storage.obj[id];
            })
            .map(obj => new this(obj));
    }

    static find(query: (EasyDbModel) => boolean, edb?: EasyDb): EasyDbModel {
        return this.getAll(edb).find(query);
    }

    static findAll(query: (EasyDbModel) => boolean, edb?: EasyDb): EasyDbModel[] {
        return this.getAll(edb).filter(query);
    }

    static getModel(name: string): typeof EasyDbModel {
        let Model = new Function(<any>EasyDbModel);
        Model.prototype = {};
        for (let method in EasyDbModel.prototype) {
            if (EasyDbModel.prototype.hasOwnProperty(method)) {
                Model.prototype[method] = EasyDbModel.prototype[method];
            }
        }
        Model.prototype.constructor = Model;
        Object.defineProperty(Model, 'name', {
            value: name,
            writable: false,
            configurable: true,
        });
        Object.defineProperty(Model, 'edb', {
            get : () => EasyDbModel.edb
        });
        let exclude = ['edb', '_edb'];
        for (let key in EasyDbModel) {
            if (EasyDbModel.hasOwnProperty(key) && exclude.indexOf(key) === -1) {
                Model[key] = EasyDbModel[key];
            }
        }

        return <typeof EasyDbModel><any>Model;
    }

    protected static _getEdb(edb?: EasyDb): EasyDb {
        let result = edb || EasyDbModel.edb;
        if (!result) {
            throw new Error(`There is no EasyDB`);
        }
        if (!result.isInitialized) {
            throw new Error(`There EasyDB is not initialized`);
        }

        return result;
    }

    id?: string;
    constructor(data?: object) {
        if (!data) {
            return;
        }
        for (let key in data) {
            if (data.hasOwnProperty(key)) {
                this[key] = data[key];
            }
        }
    }

    toObject(): ObjectWithId {
        let result = <this>{};
        for (let key in this) {
            if (this.hasOwnProperty(key)) {
                result[key] = this[key];
            }
        }
        return result;
    }

    getClass(): typeof EasyDbModel {
        return <typeof EasyDbModel>this.constructor;
    }

    updateId(edb?: EasyDb) {
        if (this.id) {
            return;
        }
        this.id = (this.getClass().getStorage(edb).nextId++).toString();
    }

    async save(immediately: boolean=false, edb?: EasyDb) {
        this.updateId(edb);
        let data = this.toObject();
        let storage = this.getClass().getStorage(edb);
        storage.obj[data.id] = data;
        if (immediately) {
            await this.getClass()._getEdb(edb).save();
        }
    }

    async delete(immediately: boolean=false, edb?: EasyDb) {
        if (!this.id) {
            return;
        }
        let storage = this.getClass().getStorage(edb);
        if (storage.obj[this.id]) {
            delete storage.obj[this.id];
            delete this.id;

            if (immediately) {
                await this.getClass()._getEdb(edb).save();
            }
        }
    }
}