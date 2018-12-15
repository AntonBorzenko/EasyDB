import { request } from './http-helper';
// import { easyDbHashFunction } from '../../shared/hash-helper';
import * as jsonpatch from 'fast-json-patch';
import {Observer} from "fast-json-patch/lib/core";
import {Operation} from "fast-json-patch";
import Timeout = NodeJS.Timeout;


class EventTrigger {
    private _callbacks: object = {};
    on(event: string, callback: Function) {
        if (!Array.isArray(this._callbacks[event])) {
            this._callbacks[event] = [];
        }
        this._callbacks[event].push(callback);
    }
    clearEventCallbacks(event: string) {
        delete this._callbacks[event];
    }
    trigger(event: string, ...options: any[]) {
        if (!Array.isArray(this._callbacks[event])) {
            return;
        }
        this._callbacks[event].forEach(callback => {
            callback(...options);
        });
    }
}

interface EasyDbMessage {
    method: string,
    data: object,
    previousHash?: number
}

export class EasyDbConnection extends EventTrigger {
    // events: subscribe(),
    // getData(data, previousHash)
    // setData(data, previousHash), updateData(updates, previousHash), changeData(method, data, previousHash),
    // connectionError(error), disconnect
    url: string = undefined;
    isSubscribed: boolean = false;
    private _ws: WebSocket = null;

    constructor(url: string) {
        super();

        if (url[url.length - 1] !== '/') {
            url += '/';
        }
        this.url = url;
    }

    _onConnectionClose(): void {
        this.isSubscribed = false;
        this.trigger('disconnect');
    }

    _onMessage(message): void {
        let messageObject: EasyDbMessage;
        try {
             messageObject = JSON.parse(message);
        }
        catch (e) {
            throw new Error(`Message "${message}" can not be parsed as object`);
        }

        switch (messageObject.method) {
            case 'update':
                this.trigger('updateData', messageObject.data, messageObject.previousHash);
                break;
            case 'set':
                this.trigger('setData', messageObject.data, messageObject.previousHash);
                break;
            default:
                throw new Error(`Method ${messageObject.method} is not supported`);
        }

        this.trigger('changeData', messageObject.method, messageObject.data, messageObject.previousHash);
    }

    subscribe(): Promise<void> {
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }

        return new Promise((resolve, reject) => {
            let resolved: boolean = false;
            let wsUrl: string = `${this.url.replace('http', 'ws')}updates`;
            this._ws = new WebSocket(wsUrl);
            this._ws.onopen = () => {
                if (resolved) return;

                setTimeout(() => {
                    if (resolved) return;
                    resolved = true;

                    this._ws.onclose = this._onConnectionClose.bind(this);
                    this._ws.onmessage = this._onMessage.bind(this);

                    this.trigger('subscribe');

                    this.isSubscribed = true;
                    resolve();
                }, 1);
            };

            this._ws.onerror = this._ws.onclose = (err) => {
                if (resolved) return;
                resolved = true;

                this.trigger('connectionError', `Does not connected`);
                this.isSubscribed = false;

                reject(`Cannot be connected to ws. ${err}`);
            }
        });
    }

    // noinspection JSUnusedGlobalSymbols
    unsubscribe(): void {
        this._ws.close();
        this.isSubscribed = false;
        this._ws = null;
    }

    async getData(): Promise<object> {
        let result = await request(this.url + 'data');
        if (!result || !result.status || !result.result) {
            throw new Error(`There is an error to connect to site`);
        }
        let data = result.result;
        this.trigger('getData', data);
        return data;
    }

    async setData(data: object): Promise<void> {
        let result = await request(`${this.url}data`, data, 'POST');
        if (!result || !result.status) {
            throw new Error(`Data can not be set`);
        }
    }

    async sendUpdates(updates: Operation[], previousHash?: number): Promise<void> {
        let result = await request(`${this.url}data`, { updates, previousHash }, 'POST' );
        if (!result || !result.status) {
            throw new Error(`Data cannot be updated`);
        }
    }
}

export interface EasyDbModification {
    method: string,
    data: object | Operation[],
}

export class EasyDbDataContainer extends EventTrigger {
    // events set(oldData, newData), update(newData, updates)
    private _data: object = {};
    private _observer: Observer<object> = null;
    private _modification: EasyDbModification = {
        method: 'none',
        data: null
    };

    constructor(data: object = undefined) {
        super();
        if (data) {
            this._setAndObserve(data);
        }
    }

    get data() {
        return this._data;
    }

    set data(data: object) {
        let previousData = this._data;
        this._setAndObserve(data);
        this._modification.method = 'set';
        this._modification.data = this._data;
        this.trigger('set', previousData, this._data);
    }

    get modification(): EasyDbModification {
        return this._modification;
    }

    clearModification() {
        this._modification = {
            method : 'none',
            data : null,
        };
    }

    unobserve() {
        this._observer.unobserve();
        this.clearEventCallbacks('set');
        this.clearEventCallbacks('update');
    }

    private _setAndObserve(data: object) {
        if (this._observer) {
            this._observer.unobserve();
        }
        this._data = data;
        this._observer = jsonpatch.observe(this._data, (updates: Operation[]) => {
            switch (this._modification.method) {
                case 'set':
                    this._modification.data = this._data;
                    break;
                case 'update':
                    let prevUpdates: Operation[] = <Operation[]>this._modification.data;
                    this._modification.data = prevUpdates.concat(updates);
                    break;
                case 'none':
                    this._modification.method = 'update';
                    this._modification.data = updates;
                    break;
            }
            this.trigger('update', data, updates);
        });
    }

    applyUpdates(updates: Operation[]): EasyDbDataContainer {
        let result = jsonpatch.applyPatch(
            jsonpatch.deepClone(this._data),
            jsonpatch.deepClone(updates),
            true
        ).newDocument;

        return new EasyDbDataContainer(result);
    }
}

export interface EasyDbOptions {
    autoInit?: boolean,
    shouldSubscribe?: true,
    onInit?: () => void,
    onError?: (error) => void,
    onSetData?: (oldData: object, newData: object) => void,
    onUpdateData?: (oldData, newData) => void,
    onChangeData?: (oldData, newData) => void,
    onSave?: () => void,
    syncTime?: number
}

export class EasyDbTimer extends EventTrigger {
    // events: tick()
    isStarted : boolean = false;
    time: number;
    timeoutId: Timeout = null;
    constructor(time) {
        super();
        this.time = time;
    }
    start() {
        if (this.isStarted) {
            return;
        }
        this.isStarted = true;
        this.timeoutId = setTimeout(() => this._onTick(), this.time);
    }
    stop() {
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
        }
        this.isStarted = false;
    }
    private _onTick() {
        this.stop();
        this.trigger('tick');
    }
}

// noinspection JSUnusedGlobalSymbols
export default class EasyDb extends EventTrigger {
    // events init(), error(), setData(oldData, newData),
    // updateData(oldData, newData, updates),
    // changeData(oldData, newData), save()
    easyDbConn: EasyDbConnection;
    shouldSubscribe: boolean = true;
    isInitialized: boolean = false;
    isSynced: boolean = false;
    private _syncTimer: EasyDbTimer;
    private _dataCnt: EasyDbDataContainer = null;

    // noinspection JSUnusedGlobalSymbols
    constructor(url, options?: EasyDbOptions) {
        super();

        options = Object.assign({
            autoInit : true,
            shouldSubscribe: true,
            syncTime: 1000,
        }, options);

        this.easyDbConn = new EasyDbConnection(url);
        this._syncTimer = new EasyDbTimer(options.syncTime);
        this._syncTimer.on('tick', () => {
            // noinspection JSIgnoredPromiseFromCall
            this.save();
        });

        this.shouldSubscribe = options.shouldSubscribe;

        for (let event of ['onInit', 'onError', 'onSetData', 'onUpdateData', 'onChangeData', 'onSave']) {
            if (options[event]) {
                let eventName = event[0].toLowerCase() + event.substr(3); // for example 'onInit' => 'init'
                this.on(eventName, options[event]);
            }
        }

        if (options.autoInit) {
            // noinspection JSIgnoredPromiseFromCall
            this.init();
        }
    }

    private _dataChanged() {
        this.isSynced = false;
        this._syncTimer.start();
    }

    async init(): Promise<void> {
        let data;
        try {
            data = await this.easyDbConn.getData();
        }
        catch (e) {
            let errorMessage = `Cannot connect to database. Reason: ${e && e.toString()}`;
            this.trigger('error', errorMessage);
            throw new Error(errorMessage);
        }
        this._dataCnt = new EasyDbDataContainer(data);
        //// events set(oldData, newData), update(newData, updates)
        this._dataCnt.on('set', () => this._dataChanged());
        this._dataCnt.on('update', () => this._dataChanged());

        if (this.shouldSubscribe) {
            try {
                await this.easyDbConn.subscribe();
            }
            catch (e) {
                let errorMessage = `Cannot subscribe. Reason: ${e && e.toString()}`;
                this.trigger('error', errorMessage);
                throw new Error(errorMessage);
            }

            this.easyDbConn.on('connectionError', (error) => {
                this.trigger('error', `Connection error: ${error && error.toString()}`);
            });

            // noinspection JSUnusedLocalSymbols
            this.easyDbConn.on('setData', (data: object, previousHash?: number) => {
                this._dataCnt.unobserve();
                let previousData = this._dataCnt.data;
                this._dataCnt = new EasyDbDataContainer(data);
                this.trigger('setData', previousData, this._dataCnt.data);
                this.trigger('changeData', previousData, this._dataCnt.data);
            });

            // noinspection JSUnusedLocalSymbols
            this.easyDbConn.on('updateData', (updates: Operation[], previousHash) => {
                this._dataCnt.unobserve();
                let previousData = this._dataCnt.data;
                this._dataCnt = this._dataCnt.applyUpdates(updates);

                this.trigger('updateData', previousData, this._dataCnt.data, updates);
                this.trigger('changeData', previousData, this._dataCnt.data);
            });
        }

        this.isInitialized = true;
        this.isSynced = true;
        this.trigger('init');
    }

    async save(): Promise<void> {
        if (this.isSynced) {
            return;
        }
        let modification = this._dataCnt.modification;
        switch (modification.method) {
            case 'none':
                this.isSynced = true;
                return;
            case 'set':
                try {
                    await this.easyDbConn.setData(modification.data);
                }
                catch (e) {
                    this.trigger('error', e);
                    throw e;
                }
                break;
            case 'update':
                try {
                    await this.easyDbConn.sendUpdates(<Operation[]>modification.data);
                }
                catch (e) {
                    this.trigger('error', e);
                    throw e;
                }
                break;
        }
        this.isSynced = true;
        this._dataCnt.clearModification();
        this._syncTimer.stop();
        this.trigger('save');
    }

    // noinspection JSUnusedGlobalSymbols
    get data(): object {
        return this._dataCnt.data;
    }

    // noinspection JSUnusedGlobalSymbols
    set data(data: object) {
        this._dataCnt.data = data;
    }
}



/*

export interface EasyDbConnectionSettings {
    connectByDefault: boolean,
    subscribeByDefault: boolean,
    onConnect: Function,
    onSubscribe: Function,
    onChange: Function,
    onReset: Function,
    onUpdate: Function,
    onError: Function,
    onLocalModification: Function,
}

export default class EasyDbConnection {
    url: string;
    options: EasyDbConnectionSettings;
    private _data: object = null;
    isConnected: boolean = false;
    isSubscribed: boolean = false;
    observer: Observer<object> = null;
    ws: WebSocket = null;

    constructor(url: string, options: EasyDbConnectionSettings) {
        options = Object.assign({}, {
            connectByDefault : true,
            subscribeByDefault : true,
        }, options);

        this.url = url[url.length - 1] === '/' ? url : url + '/';
        this.options = options;

        if (this.options.connectByDefault) {
            this.connect()
                .then((result: boolean) => {
                    if (!result) {
                        throw new Error(`EasyDb can not be connected to ${this.url}`);
                    }
                    if (this.options.subscribeByDefault) {
                        return this.subscribe().then((result: boolean) => {
                            throw new Error(`EasyDb can not be subscribed to server`);
                        });
                    }
                });
        }
    }
    getData(): object {
        if (this._data === null) {
            throw new Error(`Data is not loaded`);
        }
        return this._data;
    }
    async setData(data: object): Promise<boolean> {
        try {
            let previousHash = easyDbHashFunction(this._data);
            let result = await request(this.url + 'data', {data, previousHash}, 'POST');
            if (!result || !result.success) {
                return false;
            }
        }
        catch (e) {
            return false;
        }
        this._data = data;
        return true;
    }

    get data(): object {
        return this.getData();
    }
    set data(value: object) {
        this.setData(value).then(result => {
            if (!result) {
                throw new Error(`data is not updated`);
            }
        });
    }
    _onDataUpdate(updates) {
        this.updates =
    }
    async connect(): Promise<boolean> {
        let result = await request(this.url + 'data');
        if (result.success !== true || !result.data) {
            return false;
        }
        // TODO add lib
        this._data = result.data;
        this.observer = jsonpatch.observe(this._data, this._onDataUpdate.bind(this));
        this.isConnected = true;
        if (this.options.onConnect) {
            this.options.onConnect();
        }
        return true;
    }
    subscribe(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            let resolved: boolean = false;
            let ws = new WebSocket(this.url + 'updates');
            ws.onopen = () => {
                if (resolved) return;
                resolved = true;

                this._onWebSocketConnection(ws);

                resolve(true);
            };
            ws.onclose = ws.onerror = () => {
                if (resolved) return;
                resolved = true;
                resolve(false);
            };
        });
    }
    private _onMessage(message) {
        // TODO
    }
    private _onWebSocketConnection(ws: WebSocket) {
        if (this.options) {}
        // TODO
    }
}*/