import { request } from './http-helper';
// import { easyDbHashFunction } from '../../shared/hash-helper';
import * as jsonpatch from 'fast-json-patch';
import {Observer} from "fast-json-patch/lib/core";
import {Operation} from "fast-json-patch";
import Timeout = NodeJS.Timeout;
import EasyDbModel from "./easy-db-model";


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

    _onMessage(messageEvent: MessageEvent): void {
        let messageObject: EasyDbMessage;
        try {
             messageObject = JSON.parse(messageEvent.data);
        }
        catch (e) {
            throw new Error(`Message "${messageEvent.data}" can not be parsed as object`);
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
        let result = await request(`${this.url}dataUpdates`, { updates, previousHash }, 'POST' );
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

    applyUpdates(updates: Operation[]): object {
        return jsonpatch.applyPatch(
            jsonpatch.deepClone(this._data),
            jsonpatch.deepClone(updates),
            true
        ).newDocument;
    }
}

export interface EasyDbOptions {
    autoInit?: boolean,
    shouldSubscribe?: true,
    setAsDefault?: true,
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
            setAsDefault: true
        }, options);

        this.easyDbConn = new EasyDbConnection(url);
        this._syncTimer = new EasyDbTimer(options.syncTime);
        this._syncTimer.on('tick', () => {
            // noinspection JSIgnoredPromiseFromCall
            this.save();
        });

        this.shouldSubscribe = options.shouldSubscribe;

        for (let event of ['onInit', 'onError', 'onSetData', 'onUpdateData', 'onChangeData', 'onSave']) {
            if (options[event])  {
                let eventName = event[2].toLowerCase() + event.substr(3); // for example 'onInit' => 'init'
                this.on(eventName, options[event]);
            }
        }

        if (options.autoInit) {
            // noinspection JSIgnoredPromiseFromCall
            this.init();
        }

        if (options.setAsDefault) {
            EasyDbModel.setEasyDb(this);
        }
    }

    private _dataChanged(): void {
        this.isSynced = false;
        this._syncTimer.start();
    }

    private _setNewData(data: object): void {
        if (this._dataCnt) {
            this._dataCnt.unobserve();
        }
        this._dataCnt = new EasyDbDataContainer(data);
        this._dataCnt.on('set', () => this._dataChanged());
        this._dataCnt.on('update', () => this._dataChanged());
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
        this._setNewData(data);

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
                let previousData = this._dataCnt.data;
                this._setNewData(data);
                this.trigger('setData', previousData, this._dataCnt.data);
                this.trigger('changeData', previousData, this._dataCnt.data);
            });

            // noinspection JSUnusedLocalSymbols
            this.easyDbConn.on('updateData', (updates: Operation[], previousHash) => {

                let previousData = this._dataCnt.data;
                this._setNewData(this._dataCnt.applyUpdates(updates));

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