const {LocalAuth, Client} = require('whatsapp-web.js');
const {createServer} = require("http");
const {Server} = require("socket.io");
const qrcode = require('qrcode');
const fs = require("fs");
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: "http://business.comerciodc.local"
    }
});

let clients = {}
let socketServer = null;
const updateListSockets = (account, socket, deleteSockets = false) => {
    if (deleteSockets) {
        if (clients.hasOwnProperty(account)) {
            if (clients[account].sockets.hasOwnProperty(socket.id)) {
                delete clients[account].sockets[socket.id]
            }
            if (Object.keys(clients[account].sockets).length === 0) {
                delete clients[account]
            }
        }
    } else {
        if (!clients.hasOwnProperty(account)) {
            clients[account] = {
                sockets: {},
                active: false,
                client: null,
            };
        }
        if (!clients[account].hasOwnProperty(socket.id)) {
            clients[account].sockets[socket.id] = socket;
        }
    }
}
const checkClient = account => {
    return clients.hasOwnProperty(account) &&
        clients[account].client !== null;
};
const emitToAllSockets = (account, event, ...args) => {
    if (clients.hasOwnProperty(account)) {
        Object.values(clients[account].sockets).forEach((connection) => {
            connection.emit(event, account, ...args);
            sendDataWebhook(account, event, ...args);
        });
    }
};
const generateQrImage = (account, qr, connection) => {
    qrcode.toDataURL(qr, {
        color: {
            dark: '#122E31',  // Color of the dots
            light: '#FFFFFFFF'  // Color of the background
        }
    }, (err, url) => {
        if (err) {
            handleError(err);
        } else {
            connection.emit('qr', account, url);
        }
    });
};
const handleError = (e) => {
    console.error('handleError', e);
    // Consider adding more error handling here
};

function createClient(account) {
    if (!checkClient(account)) {

        let client = new Client({
            authStrategy: new LocalAuth({clientId: account}),
        });

        clients[account].client = client;
        if (socketServer !== null) {
            if (!clients[account].sockets.hasOwnProperty(socketServer.id)) {
                clients[account].sockets[socketServer.id] = socketServer;
            }
        }
        
        client.initialize();

        console.log('createClient:89', account);

        client.on('authenticated', () => {
            try {
                clients[account].active = true;
                emitToAllSockets(account, 'authenticated', 'Whatsapp is authenticated!')
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('auth_failure', msg => {
            try {
                emitToAllSockets(account, 'auth_failure', msg)
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('ready', () => {
            try {
                emitToAllSockets(account, 'ready', 'Whatsapp is ready!')
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('loading_screen', (percent, message) => {
            try {
                emitToAllSockets(account, 'loading_screen', percent, message);
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('qr', (qr) => {
            try {
                Object.values(clients[account].sockets).forEach((connection, index) => {
                    generateQrImage(account, qr, connection);
                });
            } catch (e) {
                handleError(e.error);
            }
        });
        
        /**
         * Chat
         */
        client.on('chat_removed', (chat) => {
            try {
                emitToAllSockets(account, 'chat_removed', chat)
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('chat_archived', (chat) => {
            try {
                emitToAllSockets(account, 'chat_archived', chat)
            } catch (e) {
                handleError(e.error);
            }
        });
        /**
         * Chat
         */
        
        /**
         * Message
         */
        client.on('message', async msg => {
            try {
                const chat = await msg.getChat();
                if (chat.isGroup || msg.from === 'status@broadcast') {
                    return
                }

                await client.getProfilePicUrl(msg.fromMe ? msg.to : msg.from)
                    .then(async profilePicUrl => {
                        msg['avatar'] = profilePicUrl;

                        if (msg.hasMedia) {
                            const media = await msg.downloadMedia();
                            emitToAllSockets(account, 'message', msg, media)
                            return;
                        }

                        emitToAllSockets(account, 'message', msg);
                    })
                    .catch(async error => {
                        msg['avatar'] = null;

                        if (msg.hasMedia) {
                            const media = await msg.downloadMedia();
                            emitToAllSockets(account, 'message', msg, media)
                            return;
                        }

                        emitToAllSockets(account, 'message', msg);
                    });
                
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('message_create', async msg => {
            try {
                const chat = await msg.getChat();
                if (chat.isGroup || msg.from === 'status@broadcast') {
                    return
                }
                
                // Fired on all message creations, including your own
                if (msg.fromMe) {
                    // if (msg.type == 'ptt') {
                    //     const media = await msg.downloadMedia().then((data) => {
                    //         const binaryData = Buffer.from(data.data, 'base64');
                    //         fs.writeFile(account+msg.'audio.ogg', binaryData, function (err) { // save
                    //             if (err) {
                    //                 console.log(err);
                    //             }});
                    //         emitToAllSockets(account, 'message_create', msg, media.url);
                    //     });
                    // }

                    await client.getProfilePicUrl(msg.to)
                        .then(async profilePicUrl => {
                            let chat = await msg.getChat();
                            msg['avatar'] = profilePicUrl;
                            msg['_data']['notifyNameTo'] = chat.name;

                            if (msg.hasMedia) {
                                const media = await msg.downloadMedia();
                                emitToAllSockets(account, 'message', msg, media)
                                return;
                            }

                            emitToAllSockets(account, 'message_create', msg);
                        })
                        .catch(async error => {
                            msg['avatar'] = null;
                            msg['_data']['notifyNameTo'] = null;

                            if (msg.hasMedia) {
                                const media = await msg.downloadMedia();
                                emitToAllSockets(account, 'message', msg, media)
                                return;
                            }

                            emitToAllSockets(account, 'message_create', msg);
                        });
                }
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('media_uploaded', async msg => {
            try {
                const chat = await msg.getChat();
                if (chat.isGroup || msg.from === 'status@broadcast') {
                    return
                }
                emitToAllSockets(account, 'media_uploaded', msg);
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('message_revoke_everyone', async (after, before) => {
            try {
                const chat = await after.getChat();
                if (chat.isGroup || after.from === 'status@broadcast') {
                    return
                }
                
                // Fired whenever a message is deleted by anyone (including you)
                // console.log(after); // message after it was deleted.
                if (before) {
                    emitToAllSockets(account, 'message_revoke_everyone', after, before);
                    // console.log(before); // message before it was deleted.
                }
                
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('message_revoke_me', async msg => {
            try {
                const chat = await msg.getChat();
                if (chat.isGroup || msg.from === 'status@broadcast') {
                    return
                }
                
                // Fired whenever a message is only deleted in your own view.
                emitToAllSockets(account, 'message_revoke_me', msg);
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('message_ack', async (msg, ack) => {
            try {
                const chat = await msg.getChat();
                if (chat.isGroup || msg.from === 'status@broadcast') {
                    return
                }
                await client.getProfilePicUrl(msg.to)
                    .then(async profilePicUrl => {
                        let chat = await msg.getChat();
                        msg['avatar'] = profilePicUrl;
                        msg['_data']['notifyNameTo'] = chat.name;
                        emitToAllSockets(account, 'message_ack', msg, ack);
                    })
                    .catch(error => {
                        msg['avatar'] = null;
                        msg['_data']['notifyNameTo'] = null;
                        emitToAllSockets(account, 'message_ack', msg, ack);
                    });
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('message_edit', async (msg, newBody, prevBody) => {
            try {
                const chat = await msg.getChat();
                if (chat.isGroup || msg.from === 'status@broadcast') {
                    return
                }
                emitToAllSockets(account, 'message_edit', msg, newBody, prevBody);
            } catch (e) {
                handleError(e.error);
            }
        });
        
        // client.on('message_reaction', async reaction => {
        //     const reactionCDC = new ReactionCDC(reaction);
        //
        //     const chat = await reactionCDC.getChat();
        //     if (chat.isGroup) {
        //         return
        //     }
        //
        //     Object.values(clients[account].sockets).forEach((connection, index) => {
        //         connection.emit('message_reaction', account, reaction);
        //     });
        // });
        
        client.on('unread_count', async chat => {
            try {
                if (chat.isGroup) {
                    return
                }
                
                emitToAllSockets(account, 'unread_count', chat);
            } catch (e) {
                handleError(e.error);
            }
            
        });
        /**
         * Message
         */
        
        client.on('contact_changed', async (message, oldId, newId, isContact) => {
            try {
                const chat = await message.getChat();
                if (chat.isGroup || message.from === 'status@broadcast') {
                    return
                }
                
                /** The time the event occurred. */
                const eventTime = (new Date(message.timestamp * 1000)).toLocaleString();
                emitToAllSockets(account, 'contact_changed', message, oldId, newId, isContact, eventTime);
            } catch (e) {
                handleError(e.error);
            }
            
            // console.log(
            //     `The contact ${oldId.slice(0, -5)}` +
            //     `${!isContact ? ' that participates in group ' +
            //         `${(await client.getChatById(message.to ?? message.from)).name} ` : ' '}` +
            //     `changed their phone number\nat ${eventTime}.\n` +
            //     `Their new phone number is ${newId.slice(0, -5)}.\n`);
            
            /**
             * Information about the @param {message}:
             *
             * 1. If a notification was emitted due to a group participant
             * changing their phone number:
             * @param {message.author} is a participant's id before the change.
             * @param {message.recipients[0]} is a participant's id after the
             *     change (a new one).
             *
             * 1.1 If the contact who changed their number WAS in the current
             *     user's contact list at the time of the change:
             * @param {message.to} is a group chat id the event was emitted in.
             * @param {message.from} is a current user's id that got an
             *     notification message in the group. Also the @param
             *     {message.fromMe} is TRUE.
             *
             * 1.2 Otherwise:
             * @param {message.from} is a group chat id the event was emitted
             *     in.
             * @param {message.to} is @type {undefined}.
             * Also @param {message.fromMe} is FALSE.
             *
             * 2. If a notification was emitted due to a contact changing their
             *     phone number:
             * @param {message.templateParams} is an array of two user's ids:
             * the old (before the change) and a new one, stored in
             *     alphabetical order.
             * @param {message.from} is a current user's id that has a chat
             *     with a user, whos phone number was changed.
             * @param {message.to} is a user's id (after the change), the
             *     current user has a chat with.
             */
        });
        
        client.on('disconnected', (reason) => {
            try {
                Object.values(clients[account].sockets).forEach((connection, index) => {
                    emitToAllSockets(account, 'disconnected', reason);
                    clients[account].active = false
                    clients[account].sockets = {}
                    client.destroy();
                });
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('change_state', state => {
            try {
                emitToAllSockets(account, 'contact_changed', state);
            } catch (e) {
                handleError(e.error);
            }
        });
        
        client.on('change_battery', batteryInfo => {
            try {
                emitToAllSockets(account, 'change_battery', batteryInfo);
            } catch (e) {
                handleError(e.error);
            }
        });
        
        // Change to false if you don't want to reject incoming calls
        let rejectCalls = false;
        client.on('call', async (call) => {
            try {
                if (call.isGroup) {
                    return
                }
                
                emitToAllSockets(account, 'call', call);
                
                // console.log('Call received, rejecting. GOTO Line 261 to disable', call);
                if (rejectCalls) await call.reject();
                await client.sendMessage(call.from, `[${call.fromMe ? 'Outgoing' : 'Incoming'}] Phone call from ${call.from}, type ${call.isGroup ? 'group' : ''} ${call.isVideo ? 'video' : 'audio'} call. ${rejectCalls ? 'This call was automatically rejected by the script.' : ''}`);
            } catch (e) {
                handleError(e.error);
            }
        });
    }
}

const handleAccount = (account, socket) => {
    updateListSockets(account, socket);
    createClient(account);
};

function isClientConnected(account) {
    return clients.hasOwnProperty(account) && clients[account].active === true;
}

function destroyClient(account) {
    if (clients[account].client !== null) {
        clients[account].client.destroy();
        clients[account].client = null;
    }
}

function getTypeWhatsApp(client) {
    return (client.info.platform === 'smbi' || client.info.platform === 'smba') ? 'business' : 'consumer';
}

async function getMe(client) {
    return await client.getProfilePicUrl(client.info.wid._serialized)
        .then(profilePicUrl => {
            client.info.avatar = profilePicUrl ?? null;
            client.info.type_whatsapp = getTypeWhatsApp(client);
            return client.info;
        })
        .catch(error => {
            console.error('Failed to get profile picture:', error);
            client.info.avatar = null;
            client.info.type_whatsapp = getTypeWhatsApp(client);
            return client.info;
        });
}

io.on("connection", socket => {
    try {
        socket.handshake.headers.account_number.split(',').forEach((account, index) => {
            handleAccount(account, socket);
        });
        
        if (socket.handshake.headers.type === 'server') {
            socketServer = socket;
        }
        
        socket.on("disconnect", (reason) => {
            socket.handshake.headers.account_number.split(',').forEach((account, index) => {
                updateListSockets(account, socket, true);
            });
        });
        
        socket.on('get_me', (account) => {
            console.log('get_me', clients[account].client.info);
            if (!clients[account].client.info) {
                clients[account].client.initialize();
                return
            }
            getMe(clients[account].client).then(info => {
                socket.emit('get_me', account, info);
                sendDataWebhook(account, 'get_me', info);
            });
        });
        
        socket.on('destroy_connection', (data) => {
            const [account] = data;
            if (clients.hasOwnProperty(account) && clients[account].client !== null) {
                clients[account].client.destroy();
                clients[account].client = null;
            }
            socket.emit('destroy_connection_result', account);
        });

        socket.on('destroy_connection_force', (data) => {
            const [account] = data;
            if (clients.hasOwnProperty(account) && clients[account].client !== null) {
                clients[account].client.destroy();
                clients[account].client = null;
            }
            socket.emit('destroy_connection_result', account);
        });
        
        socket.on('send_seen', (data) => {
            const [account, chatId] = data;

            // if (clients.hasOwnProperty(account) && clients[account].client
            // !== null) { clients[account].client.sendSeen(chatId); }
        });
        
        socket.on('send_message', (data) => {
            console.log('send_message', data)
            const [account, chatId, message, quotedId] = data;
            
            if (clients.hasOwnProperty(account) && clients[account].client !== null) {
                clients[account].client.sendSeen(chatId);
                if (quotedId !== null) {
                    clients[account].client.getMessageById(quotedId).then((messageToReply) => {
                        if (messageToReply != null) {
                            messageToReply.reply(message);
                        }
                    });
                } else {
                    clients[account].client.sendMessage(chatId, message);
                }
            }
        });
        
        socket.on('delete_message', (data) => {
            const [account, messageId, all] = data;
            if (clients.hasOwnProperty(account) && clients[account].client !== null) {
                clients[account].client.getMessageById(messageId._serialized).then((message) => {
                    if (message != null) {
                        message.delete(all);
                    }
                });
            }
        });
        
    } catch (ProtocolError) {
        console.error('Ocurrió un error:', ProtocolError);
    }
});

httpServer.listen(1411, function () {
    console.log('App running on *: ' + 1411);
});

function sendDataWebhook(account, event, ...args) {
    const ignoreEvents = ['authenticated', 'ready', 'loading_screen', 'qr', 'auth_failure'];
    if (ignoreEvents.includes(event)) {
        return;
    }

    let data = JSON.stringify({
        "account": account,
        "event": event,
        "payload": {...args},
    });

    // Aquí es donde calcularías la longitud del contenido. Esto dependerá
    // de tu solicitud específica.
    const contentLength = Buffer.byteLength(data, 'utf8');
    // Aquí es donde calcularías las firmas. Esto dependerá de tu algoritmo
    // de firma específico.
    const signature = crypto.createHmac('sha256', process.env.CDC_WEBHOOK_SECRET).update(data).digest('hex');
    const signature256 = crypto.createHmac('sha256', process.env.CDC_WEBHOOK_SECRET_256).update(data).digest('hex');

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: process.env.CDC_WEBHOOK_URL,
        headers: {
            'CDC-Signature': signature,
            'CDC-Signature-256': signature256,
            'Content-Length': contentLength.toString(),
            'CDC-Event': event,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        data: data
    };


    axios.request(config)
        .then((response) => {
            console.log('sendDataWebhook:595', JSON.stringify(response.data));
        })
        .catch((error) => {
            console.log(error);
        });
}