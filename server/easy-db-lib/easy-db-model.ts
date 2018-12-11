import * as fs from 'fs';
import { easyDb as easyDbConfig } from '../../config';
import { easyDbHashFunction } from '../../shared/hash-helper';
import * as jsonPatch from 'fast-json-patch';
import {Operation} from "fast-json-patch";
import Timeout = NodeJS.Timeout;
const debug = require('debug')('easy-db:app');

export type OnUpdateCallback = (updateType: string, data: object, previousHash: number) => void;

export default class EasyDbModel {
    updated: boolean = false;
    private _onUpdateFuncs: OnUpdateCallback[] = [];
    private _updateTime: number = 20000;
    private _filePath: string = easyDbConfig.dataFile;
    private _data: Object = {};
    private _timer: Timeout = undefined;

    constructor() {
        this.loadData();
        this.startTimer();
    }
    loadData(): void {
        try {
            let dataString = fs.readFileSync(this._filePath, {encoding: 'utf8'});
            this._data = JSON.parse(dataString);
        }
        catch (e) {
            this._data = {};
            this.updated = true;
        }
    }
    async save(): Promise<void> {
        if (!this.updated) {
            return;
        }
        fs.writeFileSync(this._filePath, JSON.stringify(this._data));
        this.updated = false;
    }
    startTimer(): void {
        this._timer = setInterval(this.save.bind(this), this._updateTime);
    }
    stopTimer(): void {
        if (this._timer !== undefined) {
            clearInterval(this._timer);
            this._timer = undefined;
        }
    }
    getData(): object {
        return this._data;
    }
    async setData(data: any): Promise<void> {
        let previousHash: number = easyDbHashFunction(this._data);
        this._data = data;
        this.updated = true;
        await this.onSetTrigger(previousHash);
    }
    async updateData(updates: Operation[], previousHash: number=undefined): Promise<void> {
        if (previousHash !== undefined && easyDbHashFunction(this._data) !== previousHash) {
            throw new Error("Hashes of data are different");
        }
        previousHash = easyDbHashFunction(this._data);
        this._data = jsonPatch.applyPatch(this._data, updates).newDocument;
        this.updated = true;
        await this.onUpdateTrigger(updates, previousHash);
    }
    async onSetTrigger(previousHash: number): Promise<void> {
        await Promise.all(this._onUpdateFuncs.map(
            fn => fn('set', this._data, previousHash)
        ));
    }
    async onUpdateTrigger(updates: Operation[], previousHash: number): Promise<void> {
        await Promise.all(this._onUpdateFuncs.map(
            fn => fn('update', updates, previousHash)
        ));
    }
    onUpdate(func: OnUpdateCallback): void {
        this._onUpdateFuncs.push(func);
    }
    onUpdateClear(): void {
        this._onUpdateFuncs = [];
    }
}