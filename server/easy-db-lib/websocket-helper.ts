export class ConnectionsHandler {
    private _nextId: number = 1;
    private _connections: object = {};
    add(ws): number {
        let nextId = this._nextId++;
        this._connections[nextId] = ws;
        return nextId;
    }
    getConnections(): object {
        return this._connections;
    }
    getConnectionsArray(): any[] {
        // noinspection TypeScriptUnresolvedFunction
        return Object.values(this._connections);
    }
    remove(id: number): boolean {
        if (id in this._connections) {
            delete this._connections[id];
            return true;
        }
        return false;
    }
}