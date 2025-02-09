/**
 * Copyright (c) Whales Corp.
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { SocketStream } from "@fastify/websocket";

require('dotenv').config();

import { startApi } from "./api/startApi";
import { createClient } from "./client";
import { BlockSync } from "./sync/BlockSync";
import { log } from "./utils/log";
import { LiteEngine } from "ton-lite-client/dist/engines/engine";
import { LiteClient } from "ton-lite-client";

const LIMIT = 2;
let limitCounter = 0;

const closeConnections = (connections: SocketStream[] | undefined) => {
    connections?.forEach(c => {
        try {
            c.socket.close()
        } catch (e) {
            console.log(`Error with closing connection (socket - ${c.socket.url})`)
            console.log(e)
        }
    })
}

const closeEngine = (engine: LiteEngine | undefined) => {
    try {
        engine?.close()
    } catch (e) {
        console.log("Error with closing engine")
        console.log(e)
    }
}

const closeClients = (child: { clients: LiteClient[] }[] | undefined) => {
    child?.forEach(c => c.clients.forEach(cc => {
        try {
            cc.engine.close()
        } catch (e) {
            console.log("Error with closing child clients")
            console.log(e)
        }
    }))
}

const start = async () => {
    let app, client, blockSync, connections
    log(`Container START ======================================`);
    try {
        //
        // Create client
        //
        log(`Start Iteration #${limitCounter} `)
        log(`======================================`)
        log('Downloading configuration...');
        client = await createClient();
        if (!client) {
            return;
        }

        //
        // Fetching initial state
        //

        log('Downloading current state....');
        let mc = await client.main.getMasterchainInfoExt().catch(e => {
            console.error('getMasterchainInfoExt', e);
        });

        if (!mc) {
            console.error('getMasterchainInfoExt Failed');
            return;
        }
        blockSync = new BlockSync(mc, client.main);

        //
        // Start API
        //

        const res = await startApi(client.main, client.child, blockSync);
        app = res.app
        connections = res.connections

    } catch (e) {
        console.error(e)
        console.log("closing app")
        closeConnections(connections)
        closeEngine(client?.main.engine)
        closeClients(client?.child)
        await blockSync?.stop()
        await app?.close()
        limitCounter++
        console.log(`[COUNT: ${limitCounter}]\tapp closed`)
        if (limitCounter < LIMIT) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            start()
        } else {
            console.log(`[COUNT: ${limitCounter}]\terror limit exceeded`)
            console.log(`EXIT!`)
        }
    }
};

start()

// catches the exception thrown when trying to connect to a dead liteserver.
process.on('uncaughtException', function (err) {
    // Handle the error prevents process exit    
    console.error('uncaughtException:', err);
});